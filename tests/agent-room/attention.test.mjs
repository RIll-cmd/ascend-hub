import assert from 'node:assert/strict';
import test from 'node:test';
import { attention } from '../../scripts/agent-room/attention.mjs';
import { validatePlan, validateRoles } from '../../scripts/agent-room/parse.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: 'claude' };
const PLAN = {
  tasks: [{ title: 'Scaffold', assignee: 'claude', description: 'Create index.js' }, { title: 'Tests', assignee: 'agy', description: 'Add tests' }],
  options: ['Merge both tasks into one', 'Give the tests to Claude'],
};

test('suggested change options are kept, trimmed and capped; bad ones are dropped without failing', () => {
  const plan = validatePlan({ ...PLAN, options: [' Split task 1 ', '', 42, 'x'.repeat(161), 'a', 'b', 'c'] }, ['claude', 'agy']);
  assert.ok(plan.ok);
  assert.deepEqual(plan.value.options, ['Split task 1', 'a', 'b', 'c']);
  assert.deepEqual(validatePlan({ tasks: PLAN.tasks }, ['claude', 'agy']).value.options, []);
  const roles = validateRoles({ ...ROLES, options: ['Make Claude the orchestrator'] });
  assert.deepEqual(roles.value.options, ['Make Claude the orchestrator']);
});

test('attention is null while the agents work and describes each gate in plain words', () => {
  assert.equal(attention({ mode: 'build', stage: 'build', pause: null }), null);
  const roles = attention({ mode: 'build', stage: 'gate-roles', pause: null, roles: ROLES, roleOptions: ['Make Claude the orchestrator'] });
  assert.deepEqual(roles, {
    kind: 'gate', gate: 'roles', decisions: ['approve', 'revise'],
    summary: 'Codex orchestrates. Claude and Antigravity code. Claude reviews.',
    options: ['Make Claude the orchestrator'],
  });
  const plan = attention({ mode: 'build', stage: 'gate-plan', pause: null, roles: ROLES, plan: { tasks: PLAN.tasks, options: PLAN.options } });
  assert.equal(plan.summary, 'The plan has 2 tasks. 1, Scaffold, for Claude. 2, Tests, for Antigravity.');
  assert.deepEqual(plan.options, PLAN.options);
  assert.deepEqual(plan.decisions, ['approve', 'revise']);
  const result = attention({ mode: 'build', stage: 'gate-result', pause: null, roles: ROLES }, [{ from: 'codex', text: 'Built the app. '.repeat(60) }]);
  assert.equal(result.gate, 'result');
  assert.deepEqual(result.decisions, ['accept', 'reject']);
  assert.ok(result.summary.startsWith('Built the app.') && result.summary.length <= 400);
  const paused = attention({ mode: 'build', stage: 'build', pause: { reason: 'Claude failed twice.' } });
  assert.deepEqual(paused, { kind: 'pause', summary: 'Claude failed twice.', options: [], decisions: ['retry', 'stop'] });
});

function planSession(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) }, { project: 'todo', task: 't', roles: ROLES });
  return { session, calls };
}

test('revise at the plan gate records the note and re-plans with the note in the conversation', async () => {
  let round = 0;
  const { session, calls } = planSession(({ stage }) => {
    assert.equal(stage, 'plan');
    round += 1;
    return { text: json(round === 1 ? PLAN : { tasks: [PLAN.tasks[0]] }) };
  });
  await session.kick();
  assert.equal(session.state.stage, 'gate-plan');
  assert.deepEqual(session.view().attention.options, PLAN.options);
  await session.gate({ gate: 'plan', decision: 'revise', note: 'Merge both tasks into one' });
  assert.equal(session.state.stage, 'gate-plan');
  assert.equal(session.state.plan.tasks.length, 1);
  assert.match(calls[1].prompt, /Owner asked for changes to the plan: Merge both tasks into one/);
  assert.ok(session.transcript.some(m => m.from === 'room' && m.text === 'Owner asked for changes to the plan: Merge both tasks into one'));
});

test('revise needs a note and is only offered at the roles and plan gates', async () => {
  const { session } = planSession(() => ({ text: json(PLAN) }));
  await session.kick();
  assert.throws(() => session.gate({ gate: 'plan', decision: 'revise', note: '  ' }), /NOTE_INVALID/);
  assert.throws(() => session.gate({ gate: 'plan', decision: 'revise', note: 'x'.repeat(2001) }), /NOTE_INVALID/);
  session.state.stage = 'gate-result';
  assert.throws(() => session.gate({ gate: 'result', decision: 'revise', note: 'more tests' }), /DECISION_INVALID/);
});
