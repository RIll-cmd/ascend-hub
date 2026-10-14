import assert from 'node:assert/strict';
import test from 'node:test';
import { usageEvent } from '../../scripts/agent-room/events.mjs';
import { cleanLimits, DEFAULT_LIMITS } from '../../scripts/agent-room/limits.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };
const PLAN = { tasks: [{ title: 'One', assignee: 'claude', description: 'a' }] };

test('usage is read from Claude result events and Codex turn.completed events only', () => {
  assert.deepEqual(usageEvent('claude', { type: 'result', total_cost_usd: 0.25, usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 10, cache_creation_input_tokens: 20 } }),
    { tokens: 36, costUsd: 0.25 });
  assert.deepEqual(usageEvent('codex', { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 5, reasoning_output_tokens: 7 } }),
    { tokens: 112, costUsd: null });
  assert.equal(usageEvent('claude', { type: 'assistant' }), null);
  assert.equal(usageEvent('codex', { type: 'turn.started' }), null);
  assert.equal(usageEvent('agy', { type: 'result', usage: { input_tokens: 1 } }), null);
});

test('limits default sensibly and reject nonsense', () => {
  assert.deepEqual(cleanLimits(undefined, DEFAULT_LIMITS), DEFAULT_LIMITS);
  assert.deepEqual(cleanLimits({ rounds: 2 }, DEFAULT_LIMITS), { ...DEFAULT_LIMITS, rounds: 2 });
  for (const bad of [{ rounds: 0 }, { turns: 1.5 }, { minutes: 'x' }, { minutes: 10_000 }, 'fast']) {
    assert.throws(() => cleanLimits(bad, DEFAULT_LIMITS), /LIMITS_INVALID/, JSON.stringify(bad));
  }
});

function session(respond, limits) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) }, { project: 'app', task: 't', roles: ROLES, limits });
  return { s, calls };
}

test('every turn records its usage on the message and in per-agent totals', async () => {
  const { s } = session(({ stage, emit }) => {
    if (stage === 'plan') {
      emit({ type: 'turn.completed', usage: { input_tokens: 1000, output_tokens: 50 } });
      return { text: json(PLAN) };
    }
    throw new Error(stage);
  });
  await s.kick();
  const planned = s.transcript.find(m => m.from === 'codex');
  assert.deepEqual(planned.usage, { tokens: 1050, costUsd: null });
  assert.deepEqual(s.state.usage.codex, { turns: 1, tokens: 1050, costUsd: 0 });
  assert.equal(s.state.turns, 1);
});

test('a task that keeps failing pauses at the round limit; retry allows one more round', async () => {
  let builds = 0;
  const { s } = session(({ stage }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') { builds += 1; return { text: 'try', files: { [`f${builds}.txt`]: 'x' } }; }
    if (stage === 'review') return { text: json({ verdict: builds >= 3 ? 'ok' : 'changes', notes: 'not yet' }) };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  }, { rounds: 2 });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(builds, 2);
  assert.equal(s.state.pause.kind, 'rounds');
  assert.equal(s.state.pause.reason, 'Task 1 reached 2 rounds. Retry allows one more.');
  await s.resume({ action: 'retry' });
  assert.equal(builds, 3);
  assert.equal(s.state.stage, 'gate-result');
});

test('the turn and work-time limits pause before the next turn; retry raises them', async () => {
  const { s, calls } = session(({ stage }) => (stage === 'plan' ? { text: json(PLAN) } : { text: 'x' }), { turns: 1 });
  await s.kick();
  assert.equal(calls.length, 1);
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(calls.length, 1, 'no second turn past the limit');
  assert.equal(s.state.pause.kind, 'turns');
  assert.match(s.state.pause.reason, /reached its 1-turn limit/);
  s.state.pause = null;
  s.state.limits.turns = 99;
  s.state.workMs = 31 * 60_000;
  s.state.limits.minutes = 30;
  await s.kick();
  assert.equal(s.state.pause.kind, 'minutes');
  assert.match(s.state.pause.reason, /worked for 31 minutes/);
  await s.resume({ action: 'retry' }).catch(() => {});
  assert.equal(s.state.limits.minutes, 45);
});
