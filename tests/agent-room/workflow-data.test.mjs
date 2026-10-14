import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const PLAN = { tasks: [{ title: 'One', assignee: 'claude', description: 'a' }] };
const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };

async function built() {
  const { dataDir, buildsRoot } = tempRoom();
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(({ stage, agent }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') return { text: 'done', files: { [`${agent}.txt`]: 'hello\n' } };
    if (stage === 'finish') return { text: 'All good.' };
    throw new Error(stage);
  }) }, { project: 'app', task: 't', roles: ROLES });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  return session;
}

test('every stage the session enters is logged once, in order, with its start time', async () => {
  const session = await built();
  assert.deepEqual(session.state.stageLog.map(s => s.stage), ['plan', 'gate-plan', 'build', 'finish', 'gate-result']);
  assert.ok(session.state.stageLog.every(s => !Number.isNaN(Date.parse(s.at))));
});

test('a task diff is served only for the session\'s own task commits', async () => {
  const session = await built();
  const commit = session.state.plan.tasks[0].commit;
  const diff = session.diff(commit);
  assert.equal(diff.commit, commit);
  assert.match(diff.text, /task-1: One/);
  assert.match(diff.text, /\+hello/);
  assert.throws(() => session.diff('deadbeef'), /DIFF_INVALID/);
  assert.throws(() => session.diff('HEAD'), /DIFF_INVALID/);
  assert.throws(() => session.diff('--output=x'), /DIFF_INVALID/);
});
