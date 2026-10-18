import assert from 'node:assert/strict';
import test from 'node:test';
import { claudeResultText, parseJsonLine, streamResultText, subagentEvent, usageEvent } from '../../scripts/agent-room/events.mjs';

// Trimmed from real `claude -p --output-format stream-json --verbose` and `codex exec --json` output (spike, 2026-10-13).
const CLAUDE = {
  started: { type: 'system', subtype: 'task_started', task_id: 'a32e', tool_use_id: 'toolu_1', description: 'Read a.txt and b.txt', subagent_type: 'Explore', spawn_depth: 1 },
  progress: { type: 'system', subtype: 'task_progress', task_id: 'a32e', description: 'Reading b.txt', subagent_type: 'Explore', usage: { total_tokens: 22157, tool_uses: 2 }, last_tool_name: 'Read' },
  updated: { type: 'system', subtype: 'task_updated', task_id: 'a32e', patch: { status: 'completed', end_time: 1791902902417 } },
  summary: { type: 'system', subtype: 'task_summary', detail: 'Reading a.txt and b.txt' },
  result: { type: 'result', subtype: 'success', result: 'alpha and beta', subagent_stats: { spawned: 1 } },
};
const CODEX = {
  waitStarted: { type: 'item.started', item: { id: 'item_4', type: 'collab_tool_call', tool: 'wait', receiver_thread_ids: [], status: 'in_progress' } },
  waitDone: { type: 'item.completed', item: { id: 'item_4', type: 'collab_tool_call', tool: 'wait', receiver_thread_ids: [], status: 'completed' } },
  command: { type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'Get-Content a.txt' } },
};

test('parses JSON lines and ignores anything else', () => {
  assert.deepEqual(parseJsonLine('{"a":1}'), { a: 1 });
  for (const bad of ['', 'plain text', '{broken', '[1,2]', 'null']) assert.equal(parseJsonLine(bad), null, bad);
});

test('Claude sub-agent lifecycle becomes started, progress and finished', () => {
  assert.deepEqual(subagentEvent('claude', CLAUDE.started), { kind: 'started', id: 'a32e', label: 'Read a.txt and b.txt (Explore)' });
  assert.deepEqual(subagentEvent('claude', CLAUDE.progress), { kind: 'progress', id: 'a32e', label: 'Reading b.txt', tool: 'Read' });
  assert.deepEqual(subagentEvent('claude', CLAUDE.updated), { kind: 'finished', id: 'a32e', status: 'completed' });
  assert.equal(subagentEvent('claude', { ...CLAUDE.updated, patch: { end_time: 1 } }), null, 'only status changes finish');
  assert.equal(subagentEvent('claude', CLAUDE.summary), null);
  assert.equal(subagentEvent('claude', CLAUDE.result), null);
});

test('Codex only reports waiting on sub-agents', () => {
  assert.deepEqual(subagentEvent('codex', CODEX.waitStarted), { kind: 'waiting' });
  assert.deepEqual(subagentEvent('codex', CODEX.waitDone), { kind: 'waited' });
  assert.equal(subagentEvent('codex', CODEX.command), null);
  assert.equal(subagentEvent('codex', CLAUDE.started), null, 'events are read per agent');
  assert.equal(subagentEvent('agy', CLAUDE.started), null);
});

test('Claude final text comes from the result event', () => {
  assert.equal(claudeResultText(CLAUDE.result), 'alpha and beta');
  assert.equal(claudeResultText(CLAUDE.progress), null);
  assert.equal(claudeResultText({ type: 'result', subtype: 'error_max_turns' }), null);
});

test('Antigravity final text and tokens come from its result event, only on success', () => {
  const result = (status, response) => ({ event: 'result', result: { status, response, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } });
  assert.equal(streamResultText('agy', result('SUCCESS', 'done')), 'done');
  assert.equal(streamResultText('agy', result('ERROR', 'partial')), null);
  assert.equal(streamResultText('agy', CLAUDE.result), null);
  assert.equal(streamResultText('claude', CLAUDE.result), 'alpha and beta');
  assert.deepEqual(usageEvent('agy', result('SUCCESS', 'done')), { tokens: 15, costUsd: null });
  assert.equal(usageEvent('agy', { event: 'step_update', step_update: {} }), null);
});
