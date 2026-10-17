import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { attention } from '../../scripts/agent-room/attention.mjs';
import { validatePlan } from '../../scripts/agent-room/parse.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const CHECK = 'node -e "process.exit(require(\'fs\').readFileSync(\'app.js\',\'utf8\').includes(\'good\') ? 0 : 1)"';
const RACE_PLAN = { tasks: [{ title: 'Greet', assignee: 'claude', description: 'Make app.js say good', race: true }] };

function repoRoom(respond, roles) {
  const { dataDir, buildsRoot } = tempRoom();
  const repo = join(dataDir, '..', 'myrepo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'app.js'), 'hello\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  const calls = [];
  const settings = { ...testSettings(buildsRoot), debateFolders: [repo] };
  const session = RoomSession.create({ dataDir, settings, runTurn: fakeRunTurn(respond, calls) }, { project: 'greet', task: 't', roles, repo, check: CHECK });
  return { repo, calls, session };
}

// Both coders must be mid-turn at once, or the race is not parallel.
function barrier(count) {
  let release;
  const all = new Promise(resolve => { release = resolve; });
  let seen = 0;
  return () => { if (++seen === count) release(); return all; };
}

test('a race task is planned only when there are several coders to race', () => {
  const two = validatePlan(RACE_PLAN, ['claude', 'codex']);
  assert.equal(two.value.tasks[0].race, true);
  assert.equal(validatePlan(RACE_PLAN, ['claude']).value.tasks[0].race, undefined);
  assert.equal(validatePlan({ tasks: [{ ...RACE_PLAN.tasks[0], race: 'yes' }] }, ['claude', 'codex']).value.tasks[0].race, undefined);
  const s = { stage: 'gate-plan', roles: { orchestrator: 'codex', coders: ['claude', 'codex'] }, plan: { tasks: two.value.tasks } };
  assert.match(attention(s).summary, /Greet, raced by every coder\./);
});

test('every coder attempts a race task in its own worktree at once; only attempts that pass the checks survive', async () => {
  const wait = barrier(2);
  const { repo, calls, session } = repoRoom(async ({ stage, agent }) => {
    if (stage === 'plan') return { text: json(RACE_PLAN) };
    if (stage === 'build') {
      await wait();
      return { text: `${agent} did it`, files: { 'app.js': agent === 'claude' ? 'good\n' : 'bad\n' } };
    }
    if (stage === 'review') return { text: json({ verdict: 'ok' }) };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(`unexpected ${stage} turn for ${agent}`);
  }, { orchestrator: 'codex', coders: ['claude', 'codex'], reviewer: 'agy' });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });

  const { projectDir } = session.state;
  const builds = calls.filter(c => c.stage === 'build');
  assert.deepEqual(builds.map(c => c.agent).sort(), ['claude', 'codex']);
  assert.equal(new Set(builds.map(c => c.cwd)).size, 2);
  assert.ok(builds.every(c => c.cwd !== projectDir), 'attempts never touch the session worktree');
  assert.ok(!calls.some(c => c.stage === 'judge'), 'a single survivor needs no judge');
  assert.deepEqual(calls.filter(c => c.stage === 'review').map(c => c.agent), ['agy'], 'the reviewer reviews the kept attempt');

  assert.equal(session.state.stage, 'gate-result');
  const task = session.state.plan.tasks[0];
  assert.equal(task.status, 'done');
  assert.equal(task.assignee, 'claude');
  assert.equal(readFileSync(join(projectDir, 'app.js'), 'utf8'), 'good\n');
  assert.equal(git(projectDir, 'rev-parse', '--short', 'HEAD').stdout.trim(), task.commit);
  assert.deepEqual(task.raced.attempts.map(a => [a.agent, a.ok]).sort(), [['claude', true], ['codex', false]]);
  assert.equal(task.raced.winner, 'claude');
  assert.ok(builds.every(c => !existsSync(c.cwd)), 'every attempt worktree is removed');
  assert.equal(git(repo, 'branch', '--list', 'room/try-*').stdout.trim(), '', 'attempt branches are deleted');
  assert.match(session.transcript.map(m => m.text).join('\n'), /Kept Claude's attempt/);
});

test('when several attempts survive, one judge turn picks the winner from their diffs', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const runTurn = fakeRunTurn(({ stage, agent }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'Write', assignee: 'claude', description: 'd', race: true }] }) };
    if (stage === 'build') return { text: `${agent} wrote it`, files: { 'out.txt': `${agent} version\n` } };
    if (stage === 'judge') return { text: json({ winner: 'codex', reason: 'Shorter and clearer.' }) };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  }, calls);
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn },
    { project: 'race-app', task: 't', roles: { orchestrator: 'agy', coders: ['claude', 'codex'], reviewer: null } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });

  const judge = calls.find(c => c.stage === 'judge');
  assert.equal(judge.agent, 'agy', 'without a reviewer the orchestrator judges');
  assert.match(judge.prompt, /claude version/);
  assert.match(judge.prompt, /codex version/);
  const task = session.state.plan.tasks[0];
  assert.equal(task.status, 'done');
  assert.equal(task.raced.winner, 'codex');
  assert.equal(task.raced.reason, 'Shorter and clearer.');
  assert.match(session.transcript.map(m => m.text).join('\n'), /Kept Codex's attempt \(\w+\): Shorter and clearer\. The other/);
  assert.equal(readFileSync(join(session.state.projectDir, 'out.txt'), 'utf8'), 'codex version\n');
});

test('a race where no attempt passes counts as one failed attempt and leaves nothing behind', async () => {
  let builds = 0;
  const { session, calls } = repoRoom(({ stage }) => {
    if (stage === 'plan') return { text: json(RACE_PLAN) };
    if (stage === 'build') return ++builds <= 2 ? { text: 'tried', files: { 'app.js': 'bad\n' } } : { text: 'no', ok: false };
    throw new Error(stage);
  }, { orchestrator: 'codex', coders: ['claude', 'codex'], reviewer: null });
  session.settings.limits = undefined;
  session.state.limits.rounds = 1;
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });

  const task = session.state.plan.tasks[0];
  assert.equal(task.attempts, 1);
  assert.match(task.notes, /no attempt passed/);
  assert.equal(session.state.pause?.kind, 'rounds');
  assert.equal(readFileSync(join(session.state.projectDir, 'app.js'), 'utf8'), 'hello\n');
  assert.ok(calls.filter(c => c.stage === 'build').every(c => !existsSync(c.cwd)));
});
