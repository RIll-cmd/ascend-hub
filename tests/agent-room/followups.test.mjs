import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { attention } from '../../scripts/agent-room/attention.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const PLAN = { tasks: [{ title: 'Greet', assignee: 'claude', description: 'Make app.js say good' }] };
const respond = ({ stage }) => ({ plan: { text: json(PLAN) }, build: { text: 'ok', files: { 'app.js': 'good\n' } }, finish: { text: '# Summary\napp.js now says good.' } })[stage];

// A repo with a local bare "origin", and a stand-in for gh that records its arguments and prints a PR link.
function setup({ origin = true } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const base = join(dataDir, '..');
  const repo = join(base, 'myrepo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'app.js'), 'hello\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  if (origin) {
    git(base, 'init', '-q', '--bare', 'origin.git');
    git(repo, 'remote', 'add', 'origin', join(base, 'origin.git'));
  }
  const ghLog = join(base, 'gh-args.json');
  const fakeGh = join(base, 'fake-gh.mjs');
  writeFileSync(fakeGh, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(ghLog)}, JSON.stringify(process.argv.slice(2)));\nconsole.log('https://github.com/me/myrepo/pull/7');\n`);
  const settings = { ...testSettings(buildsRoot), debateFolders: [repo], gh: { command: process.execPath, prefixArgs: [fakeGh] } };
  return { repo, base, ghLog, opts: { dataDir, settings, runTurn: fakeRunTurn(respond) } };
}

async function toResult(ctx) {
  const session = RoomSession.create(ctx.opts, { project: 'greet', task: 'Make the greeting say good\nMore detail here.', roles: ROLES, repo: ctx.repo });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(session.state.stage, 'gate-result');
  return session;
}

test('the result gate can push the branch and open a pull request with the summary as its body', async () => {
  const ctx = setup();
  const session = await toResult(ctx);
  const { branch } = session.state.repo;
  assert.deepEqual(attention(session.state, session.transcript).decisions, ['merge', 'accept', 'reject'], 'voice gates never offer a push');
  await session.gate({ gate: 'result', decision: 'pr' });

  assert.equal(session.state.stage, 'done');
  assert.equal(session.state.repo.prUrl, 'https://github.com/me/myrepo/pull/7');
  assert.ok(git(join(ctx.base, 'origin.git'), 'branch', '--list', branch).stdout.trim(), 'the branch is pushed');
  const args = JSON.parse(readFileSync(ctx.ghLog, 'utf8'));
  assert.deepEqual(args.slice(0, 6), ['pr', 'create', '--base', 'main', '--head', branch]);
  assert.equal(args[args.indexOf('--title') + 1], 'Make the greeting say good');
  assert.match(args[args.indexOf('--body') + 1], /app\.js now says good/);
  assert.equal(existsSync(session.state.projectDir), false, 'the worktree goes');
  assert.ok(git(ctx.repo, 'branch', '--list', branch).stdout.trim(), 'the branch stays');
  assert.match(session.transcript.at(-1).text, /pull request.*pull\/7/);
});

test('a pull request that cannot be opened keeps the gate open', async () => {
  const ctx = setup({ origin: false });
  const session = await toResult(ctx);
  assert.throws(() => session.gate({ gate: 'result', decision: 'pr' }), /PR_FAILED.*origin/);
  assert.equal(session.state.stage, 'gate-result');
  assert.ok(existsSync(session.state.projectDir));
});

test('stopped repo sessions list their leftover worktrees, and cleaning removes them but keeps the branches', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const ctx = setup();
  const stopped = RoomSession.create(ctx.opts, { project: 'greet', task: 't', roles: ROLES, repo: ctx.repo });
  await stopped.stop();
  const { projectDir, repo: { branch } } = stopped.state;
  assert.ok(existsSync(projectDir));
  const room = await startRoomServer({ ...ctx.opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = (method, path) => fetch(`http://127.0.0.1:${room.port}${path}`, { method, headers: { authorization: `Bearer ${room.token}` } });
    const listed = (await (await call('GET', '/worktrees')).json()).worktrees;
    assert.deepEqual(listed.map(w => [w.project, w.branch, w.dir]), [['greet', branch, projectDir]]);
    const removed = (await (await call('POST', '/worktrees/clean')).json()).removed;
    assert.equal(removed.length, 1);
    assert.equal(existsSync(projectDir), false);
    assert.ok(git(ctx.repo, 'branch', '--list', branch).stdout.trim(), 'committed work stays on its branch');
    assert.deepEqual((await (await call('GET', '/worktrees')).json()).worktrees, []);
  } finally {
    await room.close();
  }
});
