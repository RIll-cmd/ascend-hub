import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readSessions, scorecard } from '../../scripts/agent-room/scorecard.mjs';
import { tempRoom } from './helpers.mjs';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const daysAgo = n => new Date(NOW - n * 86_400_000).toISOString();
let seq = 0;
const session = ({ stage = 'done', tasks = [], roles = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' }, usage = {}, transcript = [], createdAt = daysAgo(1), stageLog = [] } = {}) => ({
  state: { id: `${NOW}-${String(++seq).padStart(6, '0')}`, mode: 'build', stage, roles, usage, createdAt, stageLog, task: 'Build a thing', plan: { tasks } },
  transcript,
});
const task = (fields = {}) => ({ id: '1', title: 'T', assignee: 'claude', status: 'done', attempts: 0, rounds: 1, ...fields });
const card = (sessions, days = 7) => scorecard(sessions, { now: NOW, days });

test('first try needs done, no failures, one round and no reassign', () => {
  const result = card([session({ tasks: [
    task({ id: '1' }),
    task({ id: '2', attempts: 1 }),
    task({ id: '3', rounds: 2 }),
    task({ id: '4', status: 'pending' }),
  ] })]);
  assert.equal(result.agents.claude.coder.tasks, 4);
  assert.equal(result.agents.claude.coder.firstTry, 1);
});

test('a reassigned task is charged to the first assignee', () => {
  const result = card([session({
    tasks: [task({ reassigned: true })],
    transcript: [
      { seq: 5, from: 'room', kind: 'assign', to: ['codex'], text: 'Task 1: T → Codex' },
      { seq: 9, from: 'room', kind: 'assign', to: ['claude'], text: 'Task 1: T → Claude' },
    ],
  })]);
  assert.equal(result.agents.codex.coder.reassignedAway, 1);
  assert.equal(result.agents.claude.coder.firstTry, 0);
  assert.equal(result.agents.claude.coder.tasks, 1);
});

test('tasks without a role count as general', () => {
  const result = card([session({ tasks: [task(), task({ id: '2', role: 'frontend' })] })]);
  assert.equal(result.byRole.general.claude.tasks, 1);
  assert.equal(result.byRole.frontend.claude.firstTry, 1);
});

test('owner-stopped sessions with no started task are left out', () => {
  const result = card([session({ stage: 'stopped', tasks: [task({ status: 'pending' })] })]);
  assert.equal(result.sessions, 0);
  assert.deepEqual(result.endings, []);
});

test('the window keeps only sessions created in the last N days', () => {
  const sessions = [session({ createdAt: daysAgo(3), tasks: [task()] }), session({ createdAt: daysAgo(10), tasks: [task()] })];
  assert.equal(card(sessions, 7).sessions, 1);
  assert.equal(card(sessions, null).sessions, 2);
  assert.equal(card(sessions, null).window.from, null);
});

test('endings list rejected and stopped sessions with the stage they ended in', () => {
  const result = card([session({ stage: 'rejected', tasks: [task()], stageLog: [{ stage: 'build' }, { stage: 'gate-result' }, { stage: 'rejected' }] })]);
  assert.equal(result.endings.length, 1);
  assert.equal(result.endings[0].stage, 'rejected');
  assert.equal(result.endings[0].lastStage, 'gate-result');
  assert.equal(result.endings[0].task, 'Build a thing');
});

test('orchestrator revisions come from owner change requests', () => {
  const result = card([session({ tasks: [task()], transcript: [
    { seq: 1, from: 'room', text: 'Owner asked for changes to the plan: split it' },
    { seq: 2, from: 'room', text: 'Owner asked for changes to the roles: swap' },
    { seq: 3, from: 'claude', text: 'Owner asked for changes to the plan: not the room' },
  ] })]);
  assert.equal(result.agents.codex.orchestrator.sessions, 1);
  assert.equal(result.agents.codex.orchestrator.done, 1);
  assert.equal(result.agents.codex.orchestrator.revisions, 2);
});

test('checks, stalls, reviewer rounds and tokens per done task', () => {
  const result = card([session({
    stage: 'rejected',
    usage: { claude: { tokens: 3000 } },
    tasks: [task({ check: { ok: true } }), task({ id: '2', check: { ok: false }, keptGoing: 1, rounds: 3 }), task({ id: '3', status: 'pending' })],
  })]);
  const claude = result.agents.claude.coder;
  assert.equal(claude.checksScored, 2);
  assert.equal(claude.checksGreen, 1);
  assert.equal(claude.stalls, 1);
  assert.equal(result.agents.claude.tokensPerPass, 1500);
  assert.equal(result.agents.agy.reviewer.tasks, 2);
  assert.equal(result.agents.agy.reviewer.roundsAsked, 2);
  assert.equal(result.agents.agy.reviewer.laterFailed, 2);
});

test('old sessions missing fields are skipped field by field, not counted as fails', () => {
  const result = card([{ state: { id: '1-abcdef', stage: 'done', createdAt: daysAgo(1), plan: { tasks: [{ id: '1', assignee: 'claude', status: 'done' }] } }, transcript: [] }]);
  assert.equal(result.agents.claude.coder.firstTry, 1);
  assert.equal(result.agents.claude.coder.checksScored, 0);
  assert.equal(result.agents.claude.tokensPerPass, null);
});

test('weekly lines name active agents and leave out zero parts', () => {
  const result = card([session({ tasks: [task(), task({ id: '2', rounds: 2 })] })]);
  assert.ok(result.weekly.includes('Claude: 2 tasks, 1 first try'));
  assert.ok(result.weekly.includes('Antigravity: 1 review round asked'));
});

test('readSessions skips a corrupt state file', () => {
  const { dataDir } = tempRoom();
  const good = join(dataDir, 'sessions', '1792902469770-ad32bc');
  const bad = join(dataDir, 'sessions', '1792902469771-ad32bd');
  mkdirSync(good, { recursive: true });
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(good, 'state.json'), JSON.stringify({ id: '1792902469770-ad32bc', stage: 'done' }));
  writeFileSync(join(good, 'transcript.jsonl'), `${JSON.stringify({ seq: 1, from: 'room', text: 'hi' })}\n{"seq":`);
  writeFileSync(join(bad, 'state.json'), '{"id":');
  const sessions = readSessions(dataDir);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].transcript.length, 1);
});
