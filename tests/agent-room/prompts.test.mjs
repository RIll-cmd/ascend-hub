import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PROMPT_CHARS, buildPrompt, rolesOf, transcriptTail } from '../../scripts/agent-room/prompts.mjs';

const roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: 'agy' };
const task = { id: 2, title: 'API', assignee: 'claude', description: 'Add /todos.', notes: '' };

test('transcript tail keeps the newest messages within limits', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ from: i % 2 ? 'claude' : 'room', text: `m${i}` }));
  const tail = transcriptTail(messages);
  assert.equal(tail.split('\n').length, 20);
  assert.ok(tail.endsWith('CLAUDE: m29'));
  assert.ok(tail.startsWith('ROOM: m10'));
  const long = transcriptTail([{ from: 'codex', text: 'old' }, { from: 'agy', text: 'x'.repeat(500) }], { maxChars: 100 });
  assert.ok(long.length <= 100);
  assert.match(long, /^ANTIGRAVITY: x+ \[truncated\]$/);
});

test('roles of an agent', () => {
  assert.deepEqual(rolesOf('agy', roles), ['coder', 'reviewer']);
  assert.deepEqual(rolesOf('codex', null), []);
});

test('each stage prompt names the stage, the agent and its rules', () => {
  const discuss = buildPrompt({ stage: 'discuss', agent: 'claude', roles: null, task: 'Build a to-do app' });
  assert.ok(discuss.startsWith('Room stage: discuss\nYou are Claude (claude)'));
  assert.match(discuss, /\[READY\]/);
  assert.match(discuss, /OWNER TASK:\nBuild a to-do app/);
  assert.match(buildPrompt({ stage: 'roles', agent: 'codex', task: 't' }), /"orchestrator"/);
  const plan = buildPrompt({ stage: 'plan', agent: 'codex', roles, task: 't' });
  assert.match(plan, /roles: orchestrator/);
  assert.match(plan, /Claude \(claude\) can edit files and run only node, npm, npx/);
  const build = buildPrompt({ stage: 'build', agent: 'claude', roles, task: 't', planText: '# Plan', extra: { task: { ...task, notes: 'missing test' } } });
  assert.match(build, /Do ONLY task 2: API/);
  assert.match(build, /not accepted: missing test/);
  assert.match(build, /Do not run git commit/);
  assert.match(build, /PLAN\.md:\n# Plan/);
  assert.match(buildPrompt({ stage: 'review', agent: 'agy', roles, task: 't', extra: { task, diff: '+line' } }), /DIFF:\n\+line/);
  assert.match(buildPrompt({ stage: 'reassign', agent: 'codex', roles, task: 't', extra: { task, reason: 'broke' } }), /"skip"/);
  assert.match(buildPrompt({ stage: 'finish', agent: 'codex', roles, task: 't' }), /Markdown/);
  assert.throws(() => buildPrompt({ stage: 'nope', agent: 'codex', task: 't' }), /Unknown stage/);
});

test('prompts never exceed the Windows-safe limit even with huge inputs', () => {
  const huge = 'y'.repeat(50_000);
  const transcript = Array.from({ length: 50 }, () => ({ from: 'codex', text: huge }));
  const prompt = buildPrompt({
    stage: 'review', agent: 'agy', roles, task: huge, planText: huge, transcript,
    extra: { task: { ...task, description: huge, notes: huge }, diff: huge },
  });
  assert.ok(prompt.length <= MAX_PROMPT_CHARS, String(prompt.length));
});
