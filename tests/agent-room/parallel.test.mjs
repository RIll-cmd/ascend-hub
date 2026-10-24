import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { validatePlan } from '../../scripts/agent-room/parse.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
const ROLES = { orchestrator: 'agy', coders: ['claude', 'codex'], reviewer: null };
// Red while bad.txt exists, so a task can break the checks on purpose.
const CHECK = 'node -e "process.exit(require(\'fs\').existsSync(\'bad.txt\') ? 1 : 0)"';
const taskOf = prompt => Number(/Do ONLY task (\d+)/.exec(prompt)[1]);

function barrier(count) {
  let release;
  const all = new Promise(resolve => { release = resolve; });
  let seen = 0;
  return () => { if (++seen === count) release(); return all; };
}

async function run(plan, build, { parallel = true, check = CHECK, arbiter = () => ({ text: 'could not' }) } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const runTurn = fakeRunTurn(async c => {
    if (c.stage === 'plan') return { text: json(plan) };
    if (c.stage === 'build') return build(c, taskOf(c.prompt));
    if (c.stage === 'arbiter') return arbiter(c);
    if (c.stage === 'finish') return { text: 'Done.' };
    if (c.stage === 'reassign') return { text: json({ action: 'skip' }) };
    throw new Error(c.stage);
  }, calls);
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn },
    { project: 'par-app', task: 't', roles: ROLES, check, parallel });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  return { session, calls, builds: calls.filter(c => c.stage === 'build') };
}

const task = (title, assignee, extra = {}) => ({ title, assignee, description: 'd', ...extra });

test('a plan task may wait for earlier tasks, and only for earlier ones', () => {
  const ok = validatePlan({ tasks: [task('a', 'claude'), task('b', 'codex'), task('c', 'claude', { after: [1, 2, 2] })] }, ['claude', 'codex']);
  assert.deepEqual(ok.value.tasks.map(t => t.after), [undefined, undefined, [1, 2]]);
  assert.match(validatePlan({ tasks: [task('a', 'claude', { after: [2] }), task('b', 'codex')] }, ['claude', 'codex']).error, /Task 1 after/);
  assert.match(validatePlan({ tasks: [task('a', 'claude', { after: [1] })] }, ['claude']).error, /Task 1 after/);
  assert.throws(() => RoomSession.create({ ...tempRoom(), settings: testSettings(tempRoom().buildsRoot), runTurn: fakeRunTurn(() => ({ text: '' })) },
    { project: 'x', task: 't', roles: ROLES, parallel: 'yes' }), /PARALLEL_INVALID/);
});

test('independent tasks run at once in their own worktrees and merge one at a time; a dependent task waits for them', async () => {
  const wait = barrier(2);
  const { session, builds } = await run({ tasks: [task('A', 'claude'), task('B', 'codex'), task('C', 'claude', { after: [1, 2] })] }, async (c, id) => {
    if (id < 3) await wait();
    return { text: `did ${id}`, files: { [`${id}.txt`]: `task ${id}\n` } };
  });
  const { projectDir } = session.state;
  assert.equal(session.state.stage, 'gate-result');
  assert.deepEqual(builds.map(c => taskOf(c.prompt)).slice(0, 2).sort(), [1, 2]);
  assert.equal(taskOf(builds[2].prompt), 3, 'task 3 starts only after 1 and 2');
  assert.ok(builds.slice(0, 2).every(c => c.cwd !== projectDir && !existsSync(c.cwd)), 'parallel tasks ran in worktrees that are gone now');
  for (const id of [1, 2, 3]) assert.equal(readFileSync(join(projectDir, `${id}.txt`), 'utf8'), `task ${id}\n`);
  const tasks = session.state.plan.tasks;
  assert.ok(tasks.every(t => t.status === 'done' && t.commit && t.check?.ok));
  const log = git(projectDir, 'log', '--format=%s', '--first-parent').stdout;
  assert.match(log, /task-3: C\ntask-2: B\ntask-1: A\n/, 'one squashed commit per task, in task order');
  assert.equal(git(projectDir, 'branch', '--list', 'room/par-*').stdout.trim(), '');
});

test('a conflicted merge the arbiter cannot resolve goes back to its coder and runs again on top of the merged work', async () => {
  let codexTries = 0;
  const { session, calls } = await run({ tasks: [task('A', 'claude'), task('B', 'codex')] }, (c, id) => {
    if (id === 2) codexTries += 1;
    return { text: 'ok', files: { 'same.txt': id === 1 ? 'from claude\n' : `from codex ${codexTries}\n` } };
  });
  const [one, two] = session.state.plan.tasks;
  assert.equal(one.status, 'done');
  assert.equal(two.status, 'done');
  assert.equal(codexTries, 2);
  const arbiter = calls.filter(c => c.stage === 'arbiter');
  assert.equal(arbiter.length, 1, 'one arbiter turn, then the old path');
  assert.equal(arbiter[0].agent, 'codex');
  assert.equal(arbiter[0].mode, 'edit');
  assert.equal(arbiter[0].cwd, session.state.projectDir);
  assert.match(arbiter[0].prompt, /conflicted in: same\.txt/);
  assert.match(session.transcript.map(m => m.text).join('\n'),
    /Task 2 attempt 1 not accepted: its changes conflict with work merged before it \(same\.txt\) and the arbiter left conflict markers in same\.txt/);
  assert.equal(readFileSync(join(session.state.projectDir, 'same.txt'), 'utf8'), 'from codex 2\n');
});

test('the arbiter resolves a conflicted merge in place, and the checks run on its result', async () => {
  let codexTries = 0;
  const { session, calls } = await run({ tasks: [task('A', 'claude'), task('B', 'codex')] }, (c, id) => {
    if (id === 2) codexTries += 1;
    return { text: 'ok', files: { 'same.txt': id === 1 ? 'from claude\n' : 'from codex\n' } };
  }, {
    arbiter: c => {
      const conflicted = readFileSync(join(c.cwd, 'same.txt'), 'utf8');
      assert.match(conflicted, /^<{7} [^]*from claude\n={7}\nfrom codex\n>{7} /m, 'the arbiter sees the markers');
      return { text: 'kept both', files: { 'same.txt': 'from claude\nfrom codex\n' } };
    },
  });
  const [one, two] = session.state.plan.tasks;
  assert.equal(one.status, 'done');
  assert.equal(two.status, 'done');
  assert.equal(codexTries, 1, 'no second build');
  assert.equal(two.attempts, 0);
  assert.ok(two.check?.ok);
  assert.equal(calls.filter(c => c.stage === 'arbiter').length, 1);
  const { projectDir } = session.state;
  assert.equal(readFileSync(join(projectDir, 'same.txt'), 'utf8'), 'from claude\nfrom codex\n');
  assert.match(session.transcript.map(m => m.text).join('\n'), /Codex resolved the conflict in same\.txt\./);
  assert.match(git(projectDir, 'log', '--format=%s', '--first-parent').stdout, /\ntask-2: B\ntask-1: A\n/, 'one commit for task 2, the resolution');
  assert.equal(git(projectDir, 'status', '--porcelain').stdout.trim(), '');
});

test('an arbiter result that turns the checks red is undone with its merge', async () => {
  let codexTries = 0;
  const { session } = await run({ tasks: [task('A', 'claude'), task('B', 'codex')] }, (c, id) => {
    if (id === 2) codexTries += 1;
    return { text: 'ok', files: { 'same.txt': id === 1 ? 'from claude\n' : `from codex ${codexTries}\n` } };
  }, { arbiter: () => ({ text: 'merged', files: { 'same.txt': 'both\n', 'bad.txt': 'x' } }) });
  const two = session.state.plan.tasks[1];
  assert.equal(two.status, 'done');
  assert.equal(codexTries, 2);
  assert.match(session.transcript.map(m => m.text).join('\n'), /Task 2 attempt 1 not accepted: the checks failed after merging/);
  assert.equal(existsSync(join(session.state.projectDir, 'bad.txt')), false);
});

test('a merge that turns the checks red is undone and only that task goes back', async () => {
  let tries = 0;
  const { session } = await run({ tasks: [task('A', 'claude'), task('B', 'codex')] }, (c, id) => {
    if (id === 1) return { text: 'ok', files: { 'a.txt': 'a\n' } };
    return ++tries === 1 ? { text: 'oops', files: { 'bad.txt': 'x' } } : { text: 'fixed', files: { 'b.txt': 'b\n' } };
  });
  const [one, two] = session.state.plan.tasks;
  assert.equal(one.status, 'done');
  assert.equal(two.status, 'done');
  assert.equal(two.attempts, 1);
  assert.match(session.transcript.map(m => m.text).join('\n'), /Task 2 attempt 1 not accepted: the checks failed after merging/);
  assert.equal(existsSync(join(session.state.projectDir, 'bad.txt')), false);
});

test('without the parallel setting tasks still run one at a time in the session worktree', async () => {
  const { session, builds } = await run({ tasks: [task('A', 'claude'), task('B', 'codex')] }, (c, id) => ({ text: 'ok', files: { [`${id}.txt`]: 'x' } }), { parallel: false });
  assert.ok(builds.every(c => c.cwd === session.state.projectDir));
  assert.equal(session.state.stage, 'gate-result');
});
