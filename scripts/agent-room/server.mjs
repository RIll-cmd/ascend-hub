import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildInvocation, defaultSettings, mergeSettings, runTurn as realRunTurn } from './agents.mjs';
import { connectorList } from './connectors.mjs';
import { AGENT_IDS } from './parse.mjs';
import { listDebateFolders, listRepos, resolveRepo, roomDataDir, roomError } from './paths.mjs';
import { finishWorktree, producedBlob, producedFiles, producedZip, projectFile, projectFiles, rootCommit, suggestCheck } from './project.mjs';
import { claudeQuota, latestCodexQuota, quotaWarning } from './quota.mjs';
import { memoryPullRequest, readMemory, writeMemory } from './memory.mjs';
import { attentionNotifier, phonePush } from './notify.mjs';
import { replyWatcher } from './phone.mjs';
import { RoomQueue } from './queue.mjs';
import { sessionMarkdown } from './export.mjs';
import { RoomSession, TERMINAL } from './session.mjs';
import { ghToken, stageSkill } from './github.mjs';
import { discardStaged, installStaged, listSkills, readRoleSets, removeSkill, saveProposedSkill, viewSkill, writeRoleSets } from './skills.mjs';
import { readJson, readJsonLines, writeJsonAtomic } from './store.mjs';
import { ensureRoomToken } from './token.mjs';

const PROBE_TTL_MS = 10 * 60_000;
const MAX_BODY = 64 * 1024;
// Starting a session may carry attachments: 12 MB of files, base64-encoded.
const MAX_START_BODY = 17 * 1024 * 1024;

export async function probeAgent(agentId, settings, runTurn = realRunTurn, onEvent) {
  // From the builds folder, like every session turn, so a per-folder trust prompt or setting shows up here first.
  let cwd = tmpdir();
  try { mkdirSync(settings.buildsRoot, { recursive: true }); cwd = settings.buildsRoot; } catch { /* the temp folder will do */ }
  const outFile = join(tmpdir(), `ascend-room-probe-${agentId}.txt`);
  const result = await runTurn(buildInvocation(agentId, 'read', 'Reply with exactly: READY', { cwd, settings, outFile }), { cwd, timeoutMs: 120_000, onEvent });
  if (result.ok && result.text.includes('READY')) return { state: 'ready' };
  return { state: 'offline', detail: result.timedOut ? 'timed out' : (result.error ?? (result.stderr || result.text || 'no reply')).slice(-200) };
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    // Drain an oversized body instead of destroying the socket, so the 413 reply still arrives.
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > limit) return reject(roomError('BODY_TOO_LARGE'));
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

const SESSION_ID = /^\d+-[0-9a-f]{6}$/;

const summaryOf = s => ({ id: s.id, mode: s.mode ?? 'build', project: s.project, stage: s.stage, title: String(s.task ?? '').split('\n')[0].slice(0, 80), createdAt: s.createdAt });
const sessionIds = root => (existsSync(root) ? readdirSync(root).filter(id => SESSION_ID.test(id)).sort().reverse() : []);

// The history list: newest first, a one-line summary each.
function listSessions(dataDir) {
  const root = join(dataDir, 'sessions');
  return sessionIds(root).slice(0, 100).map(id => readJson(join(root, id, 'state.json'))).filter(Boolean).map(summaryOf);
}

// About 140 characters of text around the first place it contains term, on one line.
function snippetAround(text, term) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = Math.max(0, flat.toLowerCase().indexOf(term));
  const start = Math.max(0, at - 60);
  return `${start > 0 ? '…' : ''}${flat.slice(start, at + term.length + 80)}${at + term.length + 80 < flat.length ? '…' : ''}`;
}

// Past sessions whose task, transcript or verdict hold every word of q (any case), newest first, at most 50, each with where it matched.
// shortcut: reads every session's files on each search; fine for hundreds of sessions, add an index (SQLite FTS5) if it gets slow.
export function searchSessions(dataDir, q) {
  const query = String(q).trim().toLowerCase();
  if (query.length < 2 || query.length > 200) throw roomError('QUERY_INVALID', 'Search for 2 to 200 characters.');
  const terms = query.split(/\s+/);
  const root = join(dataDir, 'sessions');
  const found = [];
  for (const id of sessionIds(root)) {
    const state = readJson(join(root, id, 'state.json'));
    if (!state) continue;
    const parts = [
      { from: 'task', text: String(state.task ?? '') },
      ...readJsonLines(join(root, id, 'transcript.jsonl')).map(m => ({ from: m.from, text: String(m.text ?? '') })),
      ...(state.answer ? [{ from: 'verdict', text: String(state.answer) }] : []),
      { from: 'project', text: String(state.project ?? '') },
    ];
    const all = parts.map(p => p.text.toLowerCase()).join('\n');
    if (!terms.every(t => all.includes(t))) continue;
    const hit = parts.find(p => p.text.toLowerCase().includes(terms[0]));
    found.push({ ...summaryOf(state), match: { from: hit.from, snippet: snippetAround(hit.text, terms[0]) } });
    if (found.length === 50) break;
  }
  return found;
}

// A build session's folder (its project or worktree), while it still exists. A debate's folder is the owner's own checkout,
// so the file viewer never opens it.
function buildState(dataDir, id) {
  if (!SESSION_ID.test(id)) throw roomError('SESSION_ID_INVALID');
  const state = readJson(join(dataDir, 'sessions', id, 'state.json'));
  return state && state.mode !== 'debate' && existsSync(state.projectDir) ? state : null;
}
const buildFolder = (dataDir, id) => buildState(dataDir, id)?.projectDir ?? null;

// Where a session's own work starts: the commit a repo session branched from, or a new project's first commit.
const workBase = state => state.repo?.base ?? rootCommit(state.projectDir);

// One check run's facts and full output, as runChecks saved them.
function readCheckRun(dataDir, id, n) {
  if (!SESSION_ID.test(id)) throw roomError('SESSION_ID_INVALID');
  const dir = join(dataDir, 'sessions', id);
  const run = readJson(join(dir, 'state.json'))?.checkRuns?.find(r => r.n === n);
  const file = join(dir, 'checks', `${n}.log`);
  return run && existsSync(file) ? { run, output: readFileSync(file, 'utf8') } : null;
}

// A whole session as Markdown, from disk with its full transcript (the page only holds the last 200 messages).
function exportSession(dataDir, id) {
  if (!SESSION_ID.test(id)) throw roomError('SESSION_ID_INVALID');
  const dir = join(dataDir, 'sessions', id);
  const state = readJson(join(dir, 'state.json'));
  return state ? sessionMarkdown(state, readJsonLines(join(dir, 'transcript.jsonl'))) : null;
}

// One past session as the room page shows it, read from disk without changing it.
function readSession(dataDir, id) {
  if (!SESSION_ID.test(id)) throw roomError('SESSION_ID_INVALID');
  const dir = join(dataDir, 'sessions', id);
  const state = readJson(join(dir, 'state.json'));
  if (!state) return null;
  // Sessions stopped before stop() reset its task still say "running" on disk; a finished session runs nothing.
  const plan = state.plan && TERMINAL.has(state.stage)
    ? { ...state.plan, tasks: state.plan.tasks.map(t => (t.status === 'running' || t.status === 'review' ? { ...t, status: 'pending' } : t)) } : state.plan;
  return { ...state, plan, active: null, attention: null, transcript: readJsonLines(join(dir, 'transcript.jsonl')).slice(-200) };
}

const STATUS_FOR = { SKILL_SCAN: 409, SKILL_EXISTS: 409, BODY_TOO_LARGE: 413, PROJECT_EXISTS: 409, SKILL_PICK: 409, SKILL_FETCH_FAILED: 502, GITHUB_FAILED: 502, REVIEW_POSTED: 409 };

export async function startRoomServer({ dataDir, settings, runTurn = realRunTurn, probe, fetchImpl = globalThis.fetch, port = 5181, idleMs = 30 * 60_000, queueMs = 15_000, replyMs = 10_000, token = randomBytes(32).toString('hex') }) {
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
  const notify = attentionNotifier(settings.notify, fetchImpl);
  const watch = s => {
    if (s) {
      s.onQuota = recordQuota;
      s.onAttention = notify;
      s.quotaOf = agent => quota[agent];
    }
    return s;
  };
  let lastRequest = Date.now();
  const queue = new RoomQueue(dataDir);
  // The queue runner: due schedules join the queue, and the next item starts once no session runs and every agent is ready.
  // A start that fails (a bad body, a missing repo) is kept with its reason and the queue moves on.
  const runQueue = () => {
    queue.due();
    if (busy() || !queue.items.length) return;
    if (Date.now() - probedAt > PROBE_TTL_MS) return refreshProbes();
    if (AGENT_IDS.some(id => agents[id].state !== 'ready')) return;
    const item = queue.take();
    try {
      session = watch(RoomSession.create({ dataDir, settings, runTurn }, item.body));
      session.say('room', `Started from the queue${item.source.startsWith('schedule:') ? ' by a schedule' : ''}: ${item.title}`);
      session.kick();
    } catch (error) {
      queue.fail(item, error.message);
    }
  };
  // gh can be slow to answer the first time, so a token once found is kept; until then each fetch asks again.
  let ghAuth = null;
  const githubToken = () => (ghAuth ??= ghToken(settings.gh));

  const server = createServer(async (req, res) => {
    lastRequest = Date.now();
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    // A file download; the name is sent both plain (ASCII only) and RFC 5987-encoded.
    const sendBytes = (bytes, type, name) => {
      const plain = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
      res.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}` });
      res.end(bytes);
    };
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'UNAUTHORIZED' });
    try {
      const route = `${req.method} ${new URL(req.url, 'http://room').pathname}`;
      const body = req.method === 'POST' ? await readBody(req, route === 'POST /sessions' ? MAX_START_BODY : MAX_BODY) : null;
      if (route === 'GET /status') {
        if (Date.now() - probedAt > PROBE_TTL_MS && !busy()) refreshProbes();
        const repos = listRepos(settings).map(dir => ({ dir, check: suggestCheck(dir, settings.checks) }));
        refreshCodexQuota();
        return send(200, { online: true, agents, buildsRoot: settings.buildsRoot, folders: listDebateFolders(settings), repos, connectors: connectorList(settings), quota, quotaWarning: quotaWarning(quota), session: session?.summary() ?? null });
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
      if (route === 'GET /queue') return send(200, queue.view());
      if (route === 'POST /queue') {
        const item = queue.add(body?.body);
        runQueue();
        return send(201, { item, ...queue.view() });
      }
      if (route === 'POST /queue/remove') {
        queue.remove(body?.id);
        return send(200, queue.view());
      }
      if (route === 'POST /schedules') return send(201, { item: queue.schedule(body ?? {}), ...queue.view() });
      if (route === 'POST /sessions') {
        if (busy()) return send(409, { error: 'SESSION_ACTIVE', message: 'A session is already running.' });
        const missing = AGENT_IDS.filter(id => agents[id].state !== 'ready');
        if (missing.length) return send(409, { error: 'AGENTS_NOT_READY', message: `Not ready: ${missing.join(', ')}.` });
        session = watch(RoomSession.create({ dataDir, settings, runTurn }, body));
        session.kick();
        return send(201, { session: session.summary() });
      }
      if (route === 'GET /sessions/current') return send(200, { session: session?.view() ?? null });
      if (route === 'GET /sessions') {
        const q = new URL(req.url, 'http://room').searchParams.get('q');
        return send(200, { sessions: q ? searchSessions(dataDir, q) : listSessions(dataDir) });
      }
      const produced = req.method === 'GET' && /^\/sessions\/([^/]+)\/produced(?:\/(file|zip))?$/.exec(new URL(req.url, 'http://room').pathname);
      if (produced) {
        const state = buildState(dataDir, produced[1]);
        if (!state) return send(404, { error: 'NO_FOLDER', message: 'This session has no folder on disk any more.' });
        const base = workBase(state);
        if (!produced[2]) return send(200, producedFiles(state.projectDir, base));
        if (produced[2] === 'zip') return sendBytes(producedZip(state.projectDir, base), 'application/zip', `${state.project}-produced.zip`);
        const path = new URL(req.url, 'http://room').searchParams.get('path') ?? '';
        return sendBytes(producedBlob(state.projectDir, base, path), 'application/octet-stream', basename(path));
      }
      const files = req.method === 'GET' && /^\/sessions\/([^/]+)\/(files|file)$/.exec(new URL(req.url, 'http://room').pathname);
      if (files) {
        const dir = buildFolder(dataDir, files[1]);
        if (!dir) return send(404, { error: 'NO_FOLDER', message: 'This session has no folder on disk any more.' });
        return send(200, files[2] === 'files' ? { dir, ...projectFiles(dir) } : projectFile(dir, new URL(req.url, 'http://room').searchParams.get('path')));
      }
      const checkRun = req.method === 'GET' && /^\/sessions\/([^/]+)\/checks\/(\d{1,6})$/.exec(new URL(req.url, 'http://room').pathname);
      if (checkRun) {
        const found = readCheckRun(dataDir, checkRun[1], Number(checkRun[2]));
        return found ? send(200, found) : send(404, { error: 'NO_CHECK_RUN' });
      }
      const exported = req.method === 'GET' && /^\/sessions\/([^/]+)\/export$/.exec(new URL(req.url, 'http://room').pathname);
      if (exported) {
        const markdown = exportSession(dataDir, exported[1]);
        return markdown ? send(200, { markdown }) : send(404, { error: 'NO_SESSION' });
      }
      const past = req.method === 'GET' && /^\/sessions\/([^/]+)$/.exec(new URL(req.url, 'http://room').pathname);
      if (past) {
        const view = session?.state.id === past[1] ? session.view() : readSession(dataDir, past[1]);
        return view ? send(200, { session: view }) : send(404, { error: 'NO_SESSION' });
      }
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
      // Pushes a branch and opens a pull request, so Hub asks the owner first.
      if (route === 'POST /memory/pr') return send(200, memoryPullRequest(dataDir, resolveRepo(body?.repo, settings), settings));
      if (route === 'GET /role-sets') return send(200, { sets: readRoleSets(dataDir) });
      if (route === 'POST /role-sets') return send(200, { sets: writeRoleSets(dataDir, body) });
      if (route === 'GET /skills') return send(200, { skills: listSkills(dataDir) });
      if (route === 'GET /skills/view') {
        const id = new URL(req.url, 'http://room').searchParams.get('id');
        return send(200, { id, text: viewSkill(dataDir, id) });
      }
      // A download from GitHub that the owner started from the skill library; it only stages, never installs.
      if (route === 'POST /skills/fetch') return send(200, { staged: await stageSkill(dataDir, body.url, { fetchImpl, update: body.update ?? null, id: body.id ?? null, token: githubToken() }) });
      if (route === 'POST /skills/install') return send(200, { installed: installStaged(dataDir, body.token, body.id ?? undefined), sets: readRoleSets(dataDir) });
      if (route === 'POST /skills/discard') { discardStaged(dataDir, body.token); return send(200, { ok: true }); }
      if (route === 'POST /skills/remove') { removeSkill(dataDir, body.id); return send(200, { ok: true }); }
      // The owner keeps a skill the agents proposed at the result gate.
      if (route === 'POST /skills/save') return send(201, { saved: saveProposedSkill(dataDir, { ...body, session: session?.state.id }), sets: readRoleSets(dataDir) });
      if (route === 'GET /sessions/current/live-diff') {
        if (!session || TERMINAL.has(session.state.stage)) return send(404, { error: 'NO_SESSION' });
        return send(200, session.liveDiff());
      }
      if (route === 'GET /sessions/current/diff') {
        if (!session) return send(404, { error: 'NO_SESSION' });
        return send(200, session.diff(new URL(req.url, 'http://room').searchParams.get('commit')));
      }
      if (!['POST /sessions/current/gate', 'POST /sessions/current/resume', 'POST /sessions/current/stop', 'POST /sessions/current/post-review',
        'POST /sessions/current/rewind', 'POST /sessions/current/note'].includes(route)) return send(404, { error: 'NOT_FOUND' });
      if (!session) return send(404, { error: 'NO_SESSION' });
      if (route === 'POST /sessions/current/gate') session.gate(body);
      else if (route === 'POST /sessions/current/post-review') session.postReview();
      else if (route === 'POST /sessions/current/rewind') session.rewind(body);
      else if (route === 'POST /sessions/current/note') session.note(body?.text);
      else if (route === 'POST /sessions/current/resume') session.resume(body);
      else await session.stop();
      return send(200, { session: session.summary() });
    } catch (error) {
      const status = STATUS_FOR[error.code] ?? (error.code ? 400 : 500);
      return send(status, { error: error.code ?? 'INTERNAL', message: error.message, ...(error.candidates ? { candidates: error.candidates } : {}), ...(error.findings ? { findings: error.findings } : {}) });
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  // Only the process that owns the port may probe, restore or touch a project: a duplicate must fail first.
  refreshProbes();
  const queueTimer = setInterval(runQueue, queueMs);
  queueTimer.unref();
  // Answers from the phone arrive by polling the private reply topic; the outcome goes back as a push.
  const replies = replyWatcher({
    notify: settings.notify, fetchImpl, everyMs: replyMs,
    onReply: reply => phonePush(settings.notify, (session?.phoneAnswer(reply) ?? { text: 'No session is open.' }).text, fetchImpl),
  });
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
    clearInterval(queueTimer);
    replies?.stop();
    rmSync(infoFile, { force: true });
    await new Promise(resolveClose => server.close(resolveClose));
  };
  // Queued or scheduled work keeps the room up, or nothing would start it.
  const idleTimer = setInterval(() => { if (!busy() && !queue.waiting && Date.now() - lastRequest > idleMs) void close(); }, 60_000);
  idleTimer.unref();

  return { port: actualPort, token, close, getSession: () => session, pollReplies: () => replies?.poll() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const hubRoot = fileURLToPath(new URL('../../', import.meta.url));
  const dataDir = roomDataDir(hubRoot);
  // envFile: where connector variables are read when the room's environment lacks them (see connectors.mjs).
  const settings = { ...mergeSettings(defaultSettings(), readJson(join(dataDir, 'settings.json'), {})), envFile: join(hubRoot, '.env.local') };
  const token = ensureRoomToken(join(hubRoot, '.env.local'));
  const room = await startRoomServer({ dataDir, settings, token, port: Number(process.env.ASCEND_ROOM_PORT ?? 5181) });
  const shutdown = () => room.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
