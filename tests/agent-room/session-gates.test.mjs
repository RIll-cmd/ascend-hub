import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { readJson, readJsonLines } from '../../scripts/agent-room/store.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null };
const PLAN = { tasks: [{ title: 'Scaffold', assignee: 'claude', description: 'Create index.js' }] };

function setup(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const runTurn = fakeRunTurn(respond, calls);
  return { calls, opts: { dataDir, settings: testSettings(buildsRoot), runTurn }, buildsRoot };
}

test('discussion takes turns in order, stops on [READY] from all, then asks Codex for roles', async () => {
  const { calls, opts } = setup(({ agent, stage }) => {
    if (stage === 'discuss') return { text: `${agent} agrees [READY]` };
    if (stage === 'roles') return { text: json(ROLES) };
    throw new Error(`unexpected ${stage}`);
  });
  const session = RoomSession.create(opts, { project: 'todo', task: 'Build a to-do app' });
  await session.kick();
  assert.deepEqual(calls.map(c => `${c.agent}:${c.stage}:${c.mode}`), ['codex:discuss:read', 'claude:discuss:read', 'agy:discuss:read', 'codex:roles:read']);
  assert.equal(session.state.stage, 'gate-roles');
  assert.deepEqual(session.state.roles, ROLES);
  const saved = readJson(join(opts.dataDir, 'sessions', session.state.id, 'state.json'));
  assert.equal(saved.stage, 'gate-roles');
  assert.ok(readJsonLines(join(opts.dataDir, 'sessions', session.state.id, 'transcript.jsonl')).some(m => m.from === 'claude'));
});

test('discussion stops at the turn cap when agents never agree', async () => {
  const { calls, opts } = setup(({ stage }) => (stage === 'discuss' ? { text: 'hmm' } : { text: json(ROLES) }));
  const session = RoomSession.create(opts, { project: 'todo', task: 't' });
  await session.kick();
  assert.equal(calls.filter(c => c.stage === 'discuss').length, 6);
  assert.equal(session.state.stage, 'gate-roles');
});

test('preset roles skip discussion; plan is written, committed and gated', async () => {
  const { calls, opts, buildsRoot } = setup(({ agent, stage }) => {
    assert.equal(agent, 'codex');
    assert.equal(stage, 'plan');
    return { text: json(PLAN) };
  });
  const session = RoomSession.create(opts, { project: 'todo', task: 't', roles: ROLES });
  await session.kick();
  assert.equal(calls.length, 1);
  assert.equal(session.state.stage, 'gate-plan');
  assert.equal(session.state.plan.tasks[0].status, 'pending');
  assert.match(readFileSync(join(buildsRoot, 'todo', 'PLAN.md'), 'utf8'), /1\. \*\*Scaffold\*\* \(claude\)/);
});

test('invalid roles JSON is re-asked once with the error, then pauses', async () => {
  const { calls, opts } = setup(({ stage }) => (stage === 'discuss' ? { text: '[READY]' } : { text: 'no json' }));
  const session = RoomSession.create(opts, { project: 'todo', task: 't' });
  await session.kick();
  const roleCalls = calls.filter(c => c.stage === 'roles');
  assert.equal(roleCalls.length, 2);
  assert.match(roleCalls[1].prompt, /previous answer was rejected: No ```json block/);
  assert.match(session.state.pause.reason, /invalid JSON twice/);
  assert.equal(session.loop, null);
});

test('a failing turn is retried once, then pauses; resume retry continues', async () => {
  let failures = 2;
  const { opts } = setup(({ stage }) => {
    if (stage === 'plan' && failures-- > 0) return { ok: false };
    return { text: json(PLAN) };
  });
  const session = RoomSession.create(opts, { project: 'todo', task: 't', roles: ROLES });
  await session.kick();
  assert.match(session.state.pause.reason, /Codex failed twice/);
  await session.resume({ action: 'retry' });
  assert.equal(session.state.pause, null);
  assert.equal(session.state.stage, 'gate-plan');
});

test('gates validate input and only open at the right stage', async () => {
  const { opts } = setup(({ stage }) => (stage === 'discuss' ? { text: '[READY]' } : stage === 'roles' ? { text: json(ROLES) } : { text: json(PLAN) }));
  const session = RoomSession.create(opts, { project: 'todo', task: 't' });
  await session.kick();
  assert.throws(() => session.gate({ gate: 'plan', decision: 'approve' }), { code: 'GATE_NOT_OPEN' });
  assert.throws(() => session.gate({ gate: 'roles', decision: 'approve', roles: { orchestrator: 'x' } }), { code: 'ROLES_INVALID' });
  await session.gate({ gate: 'roles', decision: 'approve', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  assert.equal(session.state.stage, 'gate-plan');
  assert.deepEqual(session.state.roles.coders, ['claude']);
  assert.throws(() => session.gate({ gate: 'plan', decision: 'approve', plan: { tasks: [{ title: 'x', assignee: 'agy', description: '' }] } }), { code: 'PLAN_INVALID' });
});

test('create validates the task and project before touching the disk', () => {
  const { opts, buildsRoot } = setup(() => ({ text: '' }));
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: '' }), { code: 'TASK_INVALID' });
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: 'x'.repeat(4001) }), { code: 'TASK_INVALID' });
  assert.throws(() => RoomSession.create(opts, { project: '../evil', task: 't' }), { code: 'PROJECT_NAME_INVALID' });
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: 't', roles: { orchestrator: 'x' } }), { code: 'ROLES_INVALID' });
  assert.equal(existsSync(buildsRoot), false);
  RoomSession.create(opts, { project: 'todo', task: 't' });
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: 't' }), { code: 'PROJECT_EXISTS' });
});
