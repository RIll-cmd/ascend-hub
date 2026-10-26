import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

test('a check run marks the session as checking until it ends', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] }) };
    if (stage === 'build') return { text: 'ok', files: { 'a.txt': 'x' } };
    return { text: '# Done' };
  };
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) },
    { project: 'checking-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, check: 'node -e "setTimeout(() => {}, 600)"' });
  await session.kick();
  assert.equal(session.state.checking ?? null, null, 'nothing runs at the plan gate');
  const building = session.gate({ gate: 'plan', decision: 'approve' });
  let seen = null;
  for (let i = 0; i < 100 && !seen; i++) {
    seen = session.state.checking;
    if (!seen) await new Promise(r => { setTimeout(r, 20); });
  }
  assert.equal(seen?.label, 'task 1');
  assert.match(seen?.since ?? '', /^\d{4}-\d\d-\d\dT/);
  await building;
  assert.equal(session.state.checking, null, 'cleared when the run ends');
});
