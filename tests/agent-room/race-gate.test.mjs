import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { attention } from '../../scripts/agent-room/attention.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
const ROLES = { orchestrator: 'agy', coders: ['claude', 'codex'], reviewer: null };

// Two attempts that both pass; the judge picks Codex.
function raceRoom(body = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const runTurn = fakeRunTurn(({ stage, agent }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'Write', assignee: 'claude', description: 'd', race: true }] }) };
    if (stage === 'build') return { text: `${agent} wrote it`, files: { 'out.txt': `${agent} version\n` } };
    if (stage === 'judge') return { text: json({ winner: 'codex', reason: 'Shorter.' }) };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  }, calls);
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn };
  const session = RoomSession.create(opts, { project: 'race-app', task: 't', roles: ROLES, raceGate: true, ...body });
  return { session, calls, opts };
}

async function toRaceGate(ctx) {
  await ctx.session.kick();
  await ctx.session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(ctx.session.state.stage, 'gate-race');
  return ctx.session;
}

test('with the race gate on, the judged attempts wait for the owner with their diffs; branches stay, worktrees go', async () => {
  const ctx = raceRoom();
  const session = await toRaceGate(ctx);
  const { projectDir } = session.state;
  const task = session.state.plan.tasks[0];
  assert.equal(task.raced.pick, 'codex');
  assert.equal(task.raced.winner, null, 'nothing is kept yet');
  assert.equal(readFileSync(join(projectDir, 'PLAN.md'), 'utf8').includes('Write'), true);
  assert.equal(existsSync(join(projectDir, 'out.txt')), false, 'the session branch is untouched');
  assert.ok(ctx.calls.filter(c => c.stage === 'build').every(c => !existsSync(c.cwd)), 'attempt worktrees are removed');
  assert.equal(git(projectDir, 'branch', '--list', 'room/try-*').stdout.trim().split('\n').length, 2, 'both attempt branches stay');

  assert.match(session.diff('attempt:claude').text, /\+claude version/);
  assert.match(session.diff('attempt:codex').text, /\+codex version/);
  assert.throws(() => session.diff('attempt:agy'), /DIFF_INVALID/);

  const asked = attention(session.state, session.transcript);
  assert.equal(asked.gate, 'race');
  assert.deepEqual(asked.decisions, ['approve'], 'voice can only keep the judge pick');
  assert.match(asked.summary, /judge picked Codex's attempt: Shorter\. Claude also passed\./);
  assert.throws(() => session.gate({ gate: 'race', decision: 'revise', note: 'x' }), /DECISION_INVALID/);
  assert.throws(() => session.gate({ gate: 'race', decision: 'pick', agent: 'agy' }), /DECISION_INVALID/);
});

test('the owner can keep another attempt than the judge picked; the rest are deleted and the session goes on', async () => {
  const ctx = raceRoom();
  const session = await toRaceGate(ctx);
  await session.gate({ gate: 'race', decision: 'pick', agent: 'claude' });
  const { projectDir } = session.state;
  const task = session.state.plan.tasks[0];
  assert.equal(session.state.stage, 'gate-result');
  assert.equal(task.status, 'done');
  assert.equal(task.raced.winner, 'claude');
  assert.equal(task.assignee, 'claude');
  assert.equal(task.raced.pending, undefined);
  assert.equal(readFileSync(join(projectDir, 'out.txt'), 'utf8'), 'claude version\n');
  assert.equal(git(projectDir, 'branch', '--list', 'room/try-*').stdout.trim(), '', 'attempt branches are deleted');
  assert.match(session.transcript.map(m => m.text).join('\n'), /Owner kept Claude's attempt for task 1 \(\w+\) over the judge's pick \(Codex\)/);
});

test('approve keeps the judge pick; the gate survives a restart; stop deletes the waiting branches', async () => {
  const ctx = raceRoom();
  const session = await toRaceGate(ctx);
  const reloaded = RoomSession.load(ctx.opts, session.dir);
  assert.equal(reloaded.state.stage, 'gate-race');
  await reloaded.gate({ gate: 'race', decision: 'approve' });
  assert.equal(reloaded.state.plan.tasks[0].raced.winner, 'codex');
  assert.equal(readFileSync(join(reloaded.state.projectDir, 'out.txt'), 'utf8'), 'codex version\n');

  const other = await toRaceGate(raceRoom());
  await other.stop();
  assert.equal(git(other.state.projectDir, 'branch', '--list', 'room/try-*').stdout.trim(), '');
});

test('without the race gate the judge pick merges at once, as before', async () => {
  const ctx = raceRoom({ raceGate: undefined });
  await ctx.session.kick();
  await ctx.session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(ctx.session.state.stage, 'gate-result');
  assert.equal(ctx.session.state.plan.tasks[0].raced.winner, 'codex');
  assert.throws(() => RoomSession.create(ctx.opts, { project: 'x2', task: 't', raceGate: 'yes' }), /RACE_GATE_INVALID/);
});
