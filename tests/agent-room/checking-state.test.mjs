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

function idleSession() {
  const { dataDir, buildsRoot } = tempRoom();
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: '' })) },
    { project: `chk-${Math.random().toString(36).slice(2, 8)}`, task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  return { session, settings: testSettings(buildsRoot) };
}

test('a session loaded after a restart is not checking', () => {
  const { session, settings } = idleSession();
  session.state.checking = { label: 'task 1', since: '2026-10-27T00:00:00Z' };
  session.save();
  const loaded = RoomSession.load({ settings, runTurn: fakeRunTurn(() => ({ text: '' })) }, session.dir);
  assert.equal(loaded.state.checking, null);
});

test('lint and coverage runs do not light the check lamp', async () => {
  const { session } = idleSession();
  const run = session.runCommand('node -e "setTimeout(() => {}, 300)"', session.state.projectDir, 'task 1 lint');
  await new Promise(r => { setTimeout(r, 100); });
  assert.equal(session.state.checking ?? null, null);
  await run;
});

test('two check runs at once keep the session checking until both end', async () => {
  const { session } = idleSession();
  const short = session.runChecks(session.state.projectDir, 'attempt claude', 'node -e "setTimeout(() => {}, 150)"');
  const long = session.runChecks(session.state.projectDir, 'attempt agy', 'node -e "setTimeout(() => {}, 700)"');
  await short;
  assert.ok(session.state.checking, 'the other run is still going');
  await long;
  assert.equal(session.state.checking, null);
});
