import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { attention } from '../../scripts/agent-room/attention.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };
const PLAN = { tasks: [{ title: 'Greet', assignee: 'claude', description: 'Make app.js say good' }] };
const CHECK = 'node -e "process.exit(require(\'fs\').readFileSync(\'app.js\',\'utf8\').includes(\'good\') ? 0 : 1)"';

function setup(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const repo = join(dataDir, '..', 'myrepo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'app.js'), 'hello\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  const calls = [];
  const settings = { ...testSettings(buildsRoot), debateFolders: [repo] };
  return { repo, calls, opts: { dataDir, settings, runTurn: fakeRunTurn(respond, calls) } };
}

async function toResult(respond, extra = {}) {
  const ctx = setup(respond);
  const session = RoomSession.create(ctx.opts, { project: 'greet', task: 't', roles: ROLES, repo: ctx.repo, check: CHECK, ...extra });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  return { ...ctx, session };
}

test('a repo session works on its own branch in its own worktree and leaves the checkout alone', () => {
  const { repo, opts } = setup(() => ({ text: json(PLAN) }));
  const session = RoomSession.create(opts, { project: 'greet', task: 't', roles: ROLES, repo });
  const { projectDir, repo: info } = session.state;
  assert.notEqual(projectDir, repo);
  assert.ok(projectDir.startsWith(join(opts.settings.buildsRoot, 'worktrees')));
  assert.match(info.branch, /^room\/greet-[0-9a-f]{6}$/);
  assert.equal(info.baseBranch, 'main');
  assert.equal(git(projectDir, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), info.branch);
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'main');
  assert.throws(() => RoomSession.create(opts, { project: 'x', task: 't', roles: ROLES, repo: 'C:\\Windows' }), /REPO_INVALID/);
  assert.throws(() => RoomSession.create(opts, { project: 'x', task: 't', roles: ROLES, repo, check: 'x'.repeat(501) }), /CHECK_INVALID/);
});

test('a failing check sends the task back with the output; a passing check reaches the reviewer', async () => {
  let tries = 0;
  const { session, calls } = await toResult(({ stage }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') return { text: 'edited', files: { 'app.js': ++tries === 1 ? 'still hello\n' : 'good\n' } };
    if (stage === 'review') return { text: json({ verdict: 'ok' }) };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  });
  assert.equal(session.state.stage, 'gate-result');
  const task = session.state.plan.tasks[0];
  assert.equal(task.status, 'done');
  assert.equal(task.check.ok, true);
  assert.equal(calls.filter(c => c.stage === 'build').length, 2);
  assert.match(calls.filter(c => c.stage === 'build')[1].prompt, /checks failed/);
  assert.equal(calls.filter(c => c.stage === 'review').length, 1, 'the reviewer only sees work that passes the checks');
  assert.match(calls.find(c => c.stage === 'review').prompt, /Checks passed/);
  assert.ok(session.transcript.some(m => /^Checks failed \(exit 1/.test(m.text)));
});

test('the result gate merges, keeps or rejects the branch, and shows the whole branch diff', async () => {
  const respond = ({ stage }) => ({ plan: { text: json(PLAN) }, build: { text: 'ok', files: { 'app.js': 'good\n' } }, review: { text: json({ verdict: 'ok' }) }, finish: { text: 'Done.' } })[stage];
  const merged = await toResult(respond);
  const view = attention(merged.session.state, merged.session.transcript);
  assert.deepEqual(view.decisions, ['merge', 'accept', 'reject']);
  assert.match(view.summary, /branch room\/greet-/);
  assert.match(merged.session.diff('all').text, /\+good/);
  await merged.session.gate({ gate: 'result', decision: 'merge' });
  assert.equal(merged.session.state.stage, 'done');
  assert.equal(readFileSync(join(merged.repo, 'app.js'), 'utf8').replace(/\r/g, ''), 'good\n');
  assert.equal(existsSync(merged.session.state.projectDir), false);

  const rejected = await toResult(respond);
  await rejected.session.gate({ gate: 'result', decision: 'reject' });
  assert.equal(rejected.session.state.stage, 'rejected');
  assert.equal(git(rejected.repo, 'branch', '--list', rejected.session.state.repo.branch).stdout.trim(), '');
  assert.equal(readFileSync(join(rejected.repo, 'app.js'), 'utf8').replace(/\r/g, ''), 'hello\n');
});

test('a refused merge keeps the gate open so the owner can keep the branch instead', async () => {
  const respond = ({ stage }) => ({ plan: { text: json(PLAN) }, build: { text: 'ok', files: { 'app.js': 'good\n' } }, review: { text: json({ verdict: 'ok' }) }, finish: { text: 'Done.' } })[stage];
  const { session, repo } = await toResult(respond);
  git(repo, 'switch', '-q', '-c', 'elsewhere');
  assert.throws(() => session.gate({ gate: 'result', decision: 'merge' }), /MERGE_REFUSED/);
  assert.equal(session.state.stage, 'gate-result');
  await session.gate({ gate: 'result', decision: 'accept' });
  assert.equal(session.state.stage, 'done');
  assert.ok(git(repo, 'branch', '--list', session.state.repo.branch).stdout.trim());
});

test('repo sessions keep PLAN.md and SUMMARY.md with the session, never in the repo', async () => {
  const respond = ({ stage }) => ({ plan: { text: json(PLAN) }, build: { text: 'ok', files: { 'app.js': 'good\n' } }, review: { text: json({ verdict: 'ok' }) }, finish: { text: 'Done.' } })[stage];
  const { session } = await toResult(respond);
  const files = git(session.state.projectDir, 'ls-tree', '-r', '--name-only', 'HEAD').stdout.trim().split('\n');
  assert.deepEqual(files.sort(), ['app.js']);
  assert.ok(existsSync(join(session.dir, 'PLAN.md')));
  assert.equal(readFileSync(join(session.dir, 'SUMMARY.md'), 'utf8').trim(), 'Done.');
  assert.equal(session.state.roles.options, undefined, 'preset roles are stored without suggestion options');
});
