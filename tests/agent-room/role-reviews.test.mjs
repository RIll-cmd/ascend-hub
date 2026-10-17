import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { writeRoleSets } from '../../scripts/agent-room/skills.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

function addSkill(dataDir, id) {
  const dir = join(dataDir, 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: About ${id}.\n---\n`, 'utf8');
}

const passOf = prompt => (/security reviewer/.test(prompt) ? 'security' : /design reviewer/.test(prompt) ? 'design' : 'code');

// Runs one session to the result gate; verdicts(pass, n) picks each review's verdict (n counts that pass's turns).
async function run({ sets, skills = [], roles, tasks, verdicts = () => 'ok', parallel = false }) {
  const { dataDir, buildsRoot } = tempRoom();
  for (const id of skills) addSkill(dataDir, id);
  writeRoleSets(dataDir, { sets: Object.fromEntries(sets.map(id => [id, { on: true }])) });
  const calls = [];
  const seen = {};
  let file = 0;
  const respond = ({ stage, prompt }) => {
    if (stage === 'plan') return { text: json({ tasks }) };
    if (stage === 'build') return { text: 'ok', files: { [`f${file++}.txt`]: 'x' } };
    if (stage === 'review') {
      const pass = passOf(prompt);
      seen[pass] = (seen[pass] ?? 0) + 1;
      const verdict = verdicts(pass, seen[pass]);
      return { text: json({ verdict, notes: verdict === 'ok' ? '' : `${pass} problem` }) };
    }
    if (stage === 'finish') return { text: '# Done' };
    if (stage === 'reassign') return { text: json({ action: 'skip' }) };
    if (stage === 'judge') return { text: json({ winner: 'claude', reason: 'simpler' }) };
    throw new Error(stage);
  };
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) },
    { project: 'rev-app', task: 't', roles, parallel });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  const reviews = calls.filter(c => c.stage === 'review').map(c => ({ pass: passOf(c.prompt), agent: c.agent, mode: c.mode, prompt: c.prompt }));
  return { session, reviews };
}

const TEAM = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };

test('the normal reviewer reads the Code reviewer skills when that set is on', async () => {
  const { reviews } = await run({ sets: ['code-reviewer'], skills: ['code-review'], roles: TEAM, tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] });
  assert.deepEqual(reviews.map(r => `${r.pass}:${r.agent}:${r.mode}`), ['code:agy:read']);
  assert.match(reviews[0].prompt, /ROLE: Code reviewer/);
  assert.match(reviews[0].prompt, /\.ascend\/skills\/code-review\/SKILL\.md/);
});

test('without the Code reviewer set the review prompt has no role', async () => {
  const { reviews } = await run({ sets: [], roles: TEAM, tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] });
  assert.equal(reviews[0].prompt.includes('ROLE:'), false);
});

test('with Security on every task also gets a security review, by the agent wearing Security', async () => {
  const roles = { ...TEAM, wear: { codex: ['security'] } };
  const { session, reviews } = await run({ sets: ['security'], skills: ['differential-review'], roles,
    tasks: [{ title: 'A', assignee: 'claude', description: 'd' }, { title: 'B', assignee: 'claude', description: 'e' }] });
  assert.deepEqual(reviews.map(r => `${r.pass}:${r.agent}`), ['code:agy', 'security:codex', 'code:agy', 'security:codex']);
  assert.match(reviews[1].prompt, /\.ascend\/skills\/differential-review\/SKILL\.md/);
  assert.ok(reviews.every(r => r.mode === 'read'));
  assert.deepEqual(session.state.plan.tasks.map(t => t.status), ['done', 'done']);
});

test('with nobody wearing a set and no reviewer, the orchestrator does the pass', async () => {
  const { reviews } = await run({ sets: ['security'], roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] });
  assert.deepEqual(reviews.map(r => `${r.pass}:${r.agent}`), ['security:codex']);
});

test('a failed security review sends the task back with its notes, and the next attempt goes through every pass again', async () => {
  const { session, reviews } = await run({ sets: ['security'], roles: TEAM, tasks: [{ title: 'A', assignee: 'claude', description: 'd' }],
    verdicts: (pass, n) => (pass === 'security' && n === 1 ? 'changes' : 'ok') });
  assert.deepEqual(reviews.map(r => r.pass), ['code', 'security', 'code', 'security']);
  const task = session.state.plan.tasks[0];
  assert.equal(task.status, 'done');
  assert.equal(task.attempts, 1);
  assert.match(session.transcript.map(m => m.text).join('\n'), /security review: security problem/i);
});

test('only frontend and UI/UX tasks get a design review, by the agent wearing UI/UX', async () => {
  const roles = { orchestrator: 'codex', coders: ['claude'], reviewer: null, wear: { agy: ['ui-ux'], claude: ['frontend'] } };
  const { reviews } = await run({ sets: ['ui-ux', 'frontend'], roles, tasks: [
    { title: 'Page', assignee: 'claude', description: 'd', role: 'frontend' },
    { title: 'API', assignee: 'claude', description: 'e' },
  ] });
  assert.deepEqual(reviews.map(r => `${r.pass}:${r.agent}`), ['design:agy']);
  assert.match(reviews[0].prompt, /task 1/);
});

test('the coder never reviews its own task when someone else can', async () => {
  const roles = { orchestrator: 'codex', coders: ['claude'], reviewer: null, wear: { claude: ['security'] } };
  const { reviews } = await run({ sets: ['security'], roles, tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] });
  assert.deepEqual(reviews.map(r => `${r.pass}:${r.agent}`), ['security:codex']);
});

test('parallel tasks get the same passes in the merge queue', async () => {
  const roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null };
  const { session, reviews } = await run({ sets: ['security'], roles, parallel: true, tasks: [
    { title: 'A', assignee: 'claude', description: 'd' }, { title: 'B', assignee: 'agy', description: 'e' },
  ] });
  assert.deepEqual(reviews.map(r => r.pass), ['security', 'security']);
  assert.deepEqual(session.state.plan.tasks.map(t => t.status), ['done', 'done']);
});

test('a raced task goes through the review passes after its winner is kept', async () => {
  const roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null };
  const { session, reviews } = await run({ sets: ['security'], roles, tasks: [{ title: 'A', assignee: 'claude', description: 'd', race: true }],
    verdicts: (pass, n) => (n === 1 ? 'changes' : 'ok') });
  assert.deepEqual(reviews.map(r => `${r.pass}:${r.agent}`), ['security:codex', 'security:codex']);
  const task = session.state.plan.tasks[0];
  assert.equal(task.raced.winner, 'claude');
  assert.equal(task.status, 'done');
  assert.equal(task.attempts, 1, 'the failed review sent it back once');
});
