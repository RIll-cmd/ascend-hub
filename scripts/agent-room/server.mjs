import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildInvocation, defaultSettings, mergeSettings, runTurn as realRunTurn } from './agents.mjs';
import { AGENT_IDS } from './parse.mjs';
import { listDebateFolders, listRepos, roomDataDir, roomError } from './paths.mjs';
import { finishWorktree, suggestCheck } from './project.mjs';
import { claudeQuota, latestCodexQuota, quotaWarning } from './quota.mjs';
import { readMemory, writeMemory } from './memory.mjs';
import { RoomSession, TERMINAL } from './session.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';
import { ensureRoomToken } from './token.mjs';

const PROBE_TTL_MS = 10 * 60_000;
const MAX_BODY = 64 * 1024;

export async function probeAgent(agentId, settings, runTurn = realRunTurn, onEvent) {
  const cwd = tmpdir();
  const outFile = join(cwd, `ascend-room-probe-${agentId}.txt`);
  const result = await runTurn(buildInvocation(agentId, 'read', 'Reply with exactly: READY', { cwd, settings, outFile }), { cwd, timeoutMs: 120_000, onEvent });
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

// A stopped repo session keeps its worktree for inspection until the owner clears it from Hub; its branch always stays.
function leftoverWorktrees(dataDir) {
  const sessions = join(dataDir, 'sessions');
  if (!existsSync(sessions)) return [];
  return readdirSync(sessions).map(id => readJson(join(sessions, id, 'state.json')))
    .filter(s => s?.stage === 'stopped' && s.repo && existsSync(s.projectDir))
    .map(s => ({ id: s.id, project: s.project, dir: s.projectDir, branch: s.repo.branch, repo: s.repo.dir }));
}

const STATUS_FOR = { BODY_TOO_LARGE: 413, PROJECT_EXISTS: 409 };

export async function startRoomServer({ dataDir, settings, runTurn = realRunTurn, probe, port = 5181, idleMs = 30 * 60_000, token = randomBytes(32).toString('hex') }) {
  // The readiness probe is a real turn, so it also refreshes Claude's quota before any session runs.
  const probeOne = probe ?? (id => probeAgent(id, settings, runTurn, event => {
    const value = id === 'claude' ? claudeQuota(event) : null;
    if (value) recordQuota('claude', value);
  }));
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
  let session = null;
  const busy = () => Boolean(session && !TERMINAL.has(session.state.stage));
  // Last known subscription windows per agent; kept across restarts so the meter is not blank until the next turn.
  const quotaFile = join(dataDir, 'quota.json');
  const quota = { claude: null, codex: null, agy: null, ...(existsSync(quotaFile) ? readJson(quotaFile) : {}) };
  const recordQuota = (agent, value) => {
    quota[agent] = { ...value, seenAt: new Date().toISOString() };
    try { writeJsonAtomic(quotaFile, quota); } catch { /* the meter is a convenience */ }
  };
  let codexQuotaAt = 0;
  const refreshCodexQuota = () => {
    if (Date.now() - codexQuotaAt < 30_000 || !settings.codexHome) return;
    codexQuotaAt = Date.now();
    const value = latestCodexQuota(settings.codexHome);
    if (value) recordQuota('codex', value);
  };
  // A Claude probe is a real (tiny) turn, so a manual refresh asks at most once a minute.
  let claudeProbedAt = 0;
  const watch = s => { if (s) s.onQuota = recordQuota; return s; };
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
        const repos = listRepos(settings).map(dir => ({ dir, check: suggestCheck(dir, settings.checks) }));
        refreshCodexQuota();
        return send(200, { online: true, agents, folders: listDebateFolders(settings), repos, quota, quotaWarning: quotaWarning(quota), session: session?.summary() ?? null });
      }
      // The meter alone: unlike /status it never starts readiness probes, so a page can poll it for free.
      if (route === 'GET /quota') {
        refreshCodexQuota();
        return send(200, { quota, quotaWarning: quotaWarning(quota) });
      }
      if (route === 'POST /quota/refresh') {
        codexQuotaAt = 0;
        refreshCodexQuota();
        // During a session Claude's own turns keep its reading current.
        const claude = !busy() && Date.now() - claudeProbedAt >= 60_000;
        if (claude) {
          claudeProbedAt = Date.now();
          agents.claude = await probeOne('claude').catch(error => ({ state: 'offline', detail: error.message }));
        }
        return send(200, { quota, quotaWarning: quotaWarning(quota), refreshed: { codex: Boolean(settings.codexHome), claude } });
      }
      if (route === 'POST /sessions') {
        if (busy()) return send(409, { error: 'SESSION_ACTIVE', message: 'A session is already running.' });
        const missing = AGENT_IDS.filter(id => agents[id].state !== 'ready');
        if (missing.length) return send(409, { error: 'AGENTS_NOT_READY', message: `Not ready: ${missing.join(', ')}.` });
        session = watch(RoomSession.create({ dataDir, settings, runTurn }, body));
        session.kick();
        return send(201, { session: session.summary() });
      }
      if (route === 'GET /sessions/current') return send(200, { session: session?.view() ?? null });
      if (route === 'GET /worktrees') return send(200, { worktrees: leftoverWorktrees(dataDir) });
      if (route === 'POST /worktrees/clean') {
        const removed = leftoverWorktrees(dataDir);
        for (const w of removed) finishWorktree(w.repo, w.dir, w.branch, null, 'keep');
        return send(200, { removed });
      }
      if (route === 'GET /memory') {
        const key = new URL(req.url, 'http://room').searchParams.get('key');
        return send(200, { key, notes: readMemory(dataDir, key) });
      }
      if (route === 'POST /memory') return send(200, { key: body?.key, notes: writeMemory(dataDir, body?.key, body?.notes) });
      if (route === 'GET /sessions/current/diff') {
        if (!session) return send(404, { error: 'NO_SESSION' });
        return send(200, session.diff(new URL(req.url, 'http://room').searchParams.get('commit')));
      }
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
  // Only the process that owns the port may probe, restore or touch a project: a duplicate must fail first.
  refreshProbes();
  session = watch(restoreSession(dataDir, settings, runTurn));
  session?.kick();
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
  const token = ensureRoomToken(join(hubRoot, '.env.local'));
  const room = await startRoomServer({ dataDir, settings, token, port: Number(process.env.ASCEND_ROOM_PORT ?? 5181) });
  const shutdown = () => room.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
