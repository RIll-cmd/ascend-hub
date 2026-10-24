import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProgress } from '../../scripts/agent-room/parse.mjs';
import { buildPrompt } from '../../scripts/agent-room/prompts.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };
const PLAN = { tasks: [{ title: 'One', assignee: 'claude', description: 'a' }] };

// The review rejects every build before passAt; progress answers with the judge's verdict.
function session({ keepGoing = true, passAt = Infinity, progress = 'continue', rounds = 2 } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  let builds = 0;
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') { builds += 1; return { text: 'tried', files: { [`f${builds}.txt`]: 'x' } }; }
    if (stage === 'review') return { text: json(builds >= passAt ? { verdict: 'ok' } : { verdict: 'changes', notes: `still wrong ${builds}` }) };
    if (stage === 'progress') return { text: json({ verdict: progress, note: 'try the other branch' }) };
    if (stage === 'reassign') return { text: json({ action: 'skip' }) };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  };
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) },
    { project: 'app', task: 't', roles: ROLES, keepGoing, limits: { rounds } });
  return { s, calls, builds: () => builds };
}

async function approvePlan(s) {
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  await s.loop;
}

test('progress verdicts are continue or stuck with a short note', () => {
  assert.deepEqual(validateProgress({ verdict: 'continue', note: '  try  x ' }).value, { verdict: 'continue', note: 'try x' });
  assert.equal(validateProgress({ verdict: 'maybe' }).ok, false);
  const prompt = buildPrompt({ stage: 'progress', agent: 'codex', roles: ROLES, task: 't',
    extra: { task: { id: 1, title: 'One', assignee: 'claude', attempts: 2, failures: ['first error', 'second error'] } } });
  assert.match(prompt, /Room stage: progress/);
  assert.match(prompt, /1\. first error\n2\. second error/);
});

test('keep-going gives a task past its round limit another round when the orchestrator sees progress', async () => {
  const { s, calls, builds } = session({ passAt: 3 });
  await approvePlan(s);
  assert.equal(s.state.stage, 'gate-result');
  assert.equal(builds(), 3);
  const task = s.state.plan.tasks[0];
  assert.equal(task.status, 'done');
  assert.equal(task.keptGoing, 1);
  assert.equal(calls.filter(c => c.stage === 'progress').length, 1);
  assert.ok(calls.filter(c => c.stage === 'progress').every(c => c.agent === 'codex' && c.mode === 'read'));
  // The orchestrator's note reaches the coder's next attempt.
  assert.match(calls.filter(c => c.stage === 'build')[2].prompt, /Orchestrator: try the other branch/);
  assert.ok(s.transcript.some(m => m.text.startsWith('Keep going: Codex sees progress on task 1')));
});

test('a stuck verdict pauses at the round limit as before', async () => {
  const { s, builds } = session({ progress: 'stuck' });
  await approvePlan(s);
  assert.equal(builds(), 2);
  assert.equal(s.state.pause?.kind, 'rounds');
  assert.ok(s.transcript.some(m => m.text.startsWith('Keep going: Codex judged task 1 stuck.')));
});

test('keep-going stops after five extra rounds per task', async () => {
  const { s, calls, builds } = session();
  await approvePlan(s);
  assert.equal(builds(), 7);
  assert.equal(calls.filter(c => c.stage === 'progress').length, 5);
  assert.equal(s.state.plan.tasks[0].keptGoing, 5);
  assert.equal(s.state.pause?.kind, 'rounds');
});

test('without keep-going no progress turn runs', async () => {
  const { s, calls } = session({ keepGoing: false });
  await approvePlan(s);
  assert.equal(calls.filter(c => c.stage === 'progress').length, 0);
  assert.equal(s.state.pause?.kind, 'rounds');
});

test('keepGoing must be a boolean', () => {
  const { dataDir, buildsRoot } = tempRoom();
  assert.throws(() => RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({})) },
    { project: 'app', task: 't', roles: ROLES, keepGoing: 'yes' }), /KEEP_GOING_INVALID/);
});
