import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildInvocation, defaultSettings, mergeSettings, runTurn as realRunTurn } from './agents.mjs';
import { AGENT_IDS } from './parse.mjs';
import { roomDataDir, roomError } from './paths.mjs';
import { RoomSession, TERMINAL } from './session.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

const PROBE_TTL_MS = 10 * 60_000;
const MAX_BODY = 64 * 1024;

export async function probeAgent(agentId, settings, runTurn = realRunTurn) {
  const cwd = tmpdir();
  const outFile = join(cwd, `ascend-room-probe-${agentId}.txt`);
  const result = await runTurn(buildInvocation(agentId, 'read', 'Reply with exactly: READY', { cwd, settings, outFile }), { cwd, timeoutMs: 120_000 });
  if (result.ok && result.text.includes('READY')) return { state: 'ready' };
  return { state: 'offline', detail: result.timedOut ? 'timed out' : (result.error ?? (result.stderr || result.text || 'no reply')).slice(-200) };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    // Drain an oversized body instead of destroying the socket, so the 413 reply still arrives.
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(roomError('BODY_TOO_LARGE'));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolveBody({});
      try {
        const body = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
        resolveBody(body);
      } catch {
        reject(roomError('BODY_INVALID'));
      }
    });
    req.on('error', reject);
  });
}

function restoreSession(dataDir, settings, runTurn) {
  const sessions = join(dataDir, 'sessions');
  if (!existsSync(sessions)) return null;
  for (const name of readdirSync(sessions).sort().reverse()) {
    const state = readJson(join(sessions, name, 'state.json'));
    if (state && !TERMINAL.has(state.stage)) return RoomSession.load({ settings, runTurn }, join(sessions, name));
  }
  return null;
}

const STATUS_FOR = { BODY_TOO_LARGE: 413, PROJECT_EXISTS: 409 };

export async function startRoomServer({ dataDir, settings, runTurn = realRunTurn, probe, port = 5181, idleMs = 30 * 60_000 }) {
  const probeOne = probe ?? (id => probeAgent(id, settings, runTurn));
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  const agents = Object.fromEntries(AGENT_IDS.map(id => [id, { state: 'checking' }]));
  let probedAt = 0;
  const refreshProbes = () => {
    probedAt = Date.now();
    for (const id of AGENT_IDS) {
      agents[id] = { state: 'checking' };
      probeOne(id).then(result => { agents[id] = result; }, error => { agents[id] = { state: 'offline', detail: error.message }; });
    }
  };
  refreshProbes();

  let session = restoreSession(dataDir, settings, runTurn);
  session?.kick();
  const busy = () => Boolean(session && !TERMINAL.has(session.state.stage));
  let lastRequest = Date.now();

  const server = createServer(async (req, res) => {
    lastRequest = Date.now();
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'UNAUTHORIZED' });
    try {
      const body = req.method === 'POST' ? await readBody(req) : null;
      const route = `${req.method} ${new URL(req.url, 'http://room').pathname}`;
      if (route === 'GET /status') {
        if (Date.now() - probedAt > PROBE_TTL_MS && !busy()) refreshProbes();
        return send(200, { online: true, agents, session: session?.summary() ?? null });
      }
      if (route === 'POST /sessions') {
        if (busy()) return send(409, { error: 'SESSION_ACTIVE', message: 'A session is already running.' });
        const missing = AGENT_IDS.filter(id => agents[id].state !== 'ready');
        if (missing.length) return send(409, { error: 'AGENTS_NOT_READY', message: `Not ready: ${missing.join(', ')}.` });
        session = RoomSession.create({ dataDir, settings, runTurn }, body);
        session.kick();
        return send(201, { session: session.summary() });
      }
      if (route === 'GET /sessions/current') return send(200, { session: session?.view() ?? null });
      if (!['POST /sessions/current/gate', 'POST /sessions/current/resume', 'POST /sessions/current/stop'].includes(route)) return send(404, { error: 'NOT_FOUND' });
      if (!session) return send(404, { error: 'NO_SESSION' });
      if (route === 'POST /sessions/current/gate') session.gate(body);
      else if (route === 'POST /sessions/current/resume') session.resume(body);
      else await session.stop();
      return send(200, { session: session.summary() });
    } catch (error) {
      const status = STATUS_FOR[error.code] ?? (error.code ? 400 : 500);
      return send(status, { error: error.code ?? 'INTERNAL', message: error.message });
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const actualPort = server.address().port;
  const infoFile = join(dataDir, 'server.json');
  writeJsonAtomic(infoFile, { port: actualPort, token, pid: process.pid });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(idleTimer);
    rmSync(infoFile, { force: true });
    await new Promise(resolveClose => server.close(resolveClose));
  };
  const idleTimer = setInterval(() => { if (!busy() && Date.now() - lastRequest > idleMs) void close(); }, 60_000);
  idleTimer.unref();

  return { port: actualPort, token, close, getSession: () => session };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const hubRoot = fileURLToPath(new URL('../../', import.meta.url));
  const dataDir = roomDataDir(hubRoot);
  const settings = mergeSettings(defaultSettings(), readJson(join(dataDir, 'settings.json'), {}));
  const room = await startRoomServer({ dataDir, settings, port: Number(process.env.ASCEND_ROOM_PORT ?? 5181) });
  const shutdown = () => room.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
