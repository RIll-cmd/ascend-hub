import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };
const PLAN = { tasks: [{ title: 'Write hello', assignee: 'claude', description: 'Make hello.js return hi.' }] };

function run(advisers, { failFirst = false } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  let builds = 0;
  const respond = ({ stage, agent }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'advise') return { text: `${agent} says: keep it to one file.` };
    if (stage === 'build') {
      builds += 1;
      return { text: 'Wrote hello.js.', files: { 'hello.js': `module.exports = () => "hi${builds}";\n` } };
    }
    if (stage === 'review') return { text: json(failFirst && builds === 1 ? { verdict: 'changes', notes: 'Add a test.' } : { verdict: 'ok' }) };
    return { text: '# Done' };
  };
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) },
    { project: 'advised', task: 't', roles: ROLES, ...(advisers === undefined ? {} : { advisers }) });
  return { session, calls };
}

test('with advisers on, every other agent advises read-only once, and the coder acts with the advice in its prompt', async () => {
  const { session, calls } = run(true, { failFirst: true });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  const advice = calls.filter(c => c.stage === 'advise');
  assert.deepEqual(advice.map(c => [c.agent, c.mode]), [['codex', 'read'], ['agy', 'read']], 'orchestrator and reviewer advise, the coder does not');
  assert.match(advice[0].prompt, /Claude will do task 1: Write hello\nMake hello\.js return hi\./);
  const builds = calls.filter(c => c.stage === 'build');
  assert.equal(builds.length, 2, 'the review asked for a second round');
  for (const b of builds) assert.match(b.prompt, /ADVICE from the other agents[^\n]*\n- Codex: codex says: keep it to one file\.\n- Antigravity: agy says: keep it to one file\./);
  assert.ok(calls.findIndex(c => c.stage === 'advise') < calls.findIndex(c => c.stage === 'build'), 'advice comes first');
  assert.equal(session.state.plan.tasks[0].advice.length, 2);
  assert.ok(session.transcript.some(m => m.from === 'agy' && m.text.includes('keep it to one file')), 'the advice is in the conversation');
});

test('without advisers nothing changes, and the option must be true or false', async () => {
  const { session, calls } = run(undefined);
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.ok(!calls.some(c => c.stage === 'advise'));
  assert.ok(!calls.find(c => c.stage === 'build').prompt.includes('ADVICE'));
  assert.equal(session.state.advisers, false);
  assert.throws(() => run('yes'), /ADVISERS_INVALID/);
});
