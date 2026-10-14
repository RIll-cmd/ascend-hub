import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const PLAN = { tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] };
const ROLES = { orchestrator: 'claude', coders: ['claude'], reviewer: null };

function setup(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  return { calls, opts: { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) } };
}

test('Claude sub-agents show on the CRT while running and as start/finish lines in the transcript', async () => {
  let session;
  const seen = {};
  const { opts } = setup(({ stage, emit }) => {
    assert.equal(stage, 'plan');
    emit({ type: 'system', subtype: 'task_started', task_id: 't1', description: 'Look around', subagent_type: 'Explore' });
    emit({ type: 'system', subtype: 'task_progress', task_id: 't1', description: 'Reading a.txt', last_tool_name: 'Read' });
    seen.running = structuredClone(session.state.active.subagents);
    emit({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'completed' } });
    seen.done = structuredClone(session.state.active.subagents);
    return { text: json(PLAN) };
  });
  session = RoomSession.create(opts, { project: 'p', task: 't', roles: ROLES });
  await session.kick();
  assert.deepEqual(seen.running, [{ id: 't1', label: 'Reading a.txt', tool: 'Read', status: 'running' }]);
  assert.deepEqual(seen.done, [{ id: 't1', label: 'Reading a.txt', tool: 'Read', status: 'completed' }]);
  const roomLines = session.transcript.filter(m => m.from === 'room').map(m => m.text);
  assert.ok(roomLines.includes('Claude started a sub-agent: Look around (Explore).'), roomLines.join('\n'));
  assert.ok(roomLines.includes('Claude\'s sub-agent finished (completed): Look around (Explore).'), roomLines.join('\n'));
  assert.equal(session.state.active, null, 'cleared after the turn');
});

test('Codex waiting on sub-agents shows on its CRT only while it waits', async () => {
  let session;
  const seen = [];
  const { opts } = setup(({ emit }) => {
    emit({ type: 'item.started', item: { type: 'collab_tool_call', tool: 'wait' } });
    seen.push(session.state.active.waiting);
    emit({ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'wait' } });
    seen.push(session.state.active.waiting);
    return { text: json(PLAN) };
  });
  session = RoomSession.create(opts, { project: 'p', task: 't', roles: { ...ROLES, orchestrator: 'codex' } });
  await session.kick();
  assert.deepEqual(seen, [true, false]);
});

test('the sub-agent switch is saved with the session and blocks Claude\'s Agent tool when off', async () => {
  const respond = () => ({ text: json(PLAN) });
  const on = setup(respond);
  await RoomSession.create(on.opts, { project: 'p', task: 't', roles: ROLES }).kick();
  assert.equal(on.calls[0].args.includes('Agent'), false);
  const off = setup(respond);
  const session = RoomSession.create(off.opts, { project: 'p', task: 't', roles: ROLES, subagents: { claude: false } });
  await session.kick();
  assert.deepEqual(session.state.subagents, { claude: false });
  assert.equal(off.calls[0].args.includes('Agent'), true);
  assert.throws(() => RoomSession.create(off.opts, { project: 'q', task: 't', subagents: { claude: 'no' } }), { code: 'SUBAGENTS_INVALID' });
});
