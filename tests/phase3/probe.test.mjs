import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { sanitizeProbeEvent } from '../../scripts/phase3-hook-probe.mjs';

test('probe correlates IDE events without retaining any input content', () => {
  const input = {
    conversationId: '94bd63a8-c6fe-4206-9cc0-cac68ccf4efe',
    invocationNum: 0, executionNum: 1, stepIdx: 3,
    terminationReason: 'model_stop', fullyIdle: true,
    prompt: 'PRIVATE-PROMPT', transcriptPath: 'PRIVATE-TRANSCRIPT',
    toolCall: { args: { code: 'PRIVATE-CODE' } },
    error: 'PRIVATE-ERROR', credentials: 'PRIVATE-SECRET',
  };
  const start = sanitizeProbeEvent('antigravity-ide', 'PreInvocation', input);
  const stop = sanitizeProbeEvent('antigravity-ide', 'Stop', input);
  assert.equal(start.event, 'PreInvocation');
  assert.equal(stop.event, 'Stop');
  assert.equal(start.correlationId, stop.correlationId);
  assert.notEqual(start.correlationId, input.conversationId);
  assert.equal(stop.terminationCategory, 'model_stop');
  assert.equal(stop.fullyIdle, true);
  assert.equal(start.invocationNum, 0);
  assert.equal(JSON.stringify([start, stop]).includes('PRIVATE-'), false);
  assert.equal('prompt' in start, false);
  assert.equal('transcriptPath' in stop, false);
});

test('unknown reason and unexpected metadata are never written as raw values', () => {
  const event = sanitizeProbeEvent('antigravity-ide', 'Stop', {
    conversationId: { prompt: 'PRIVATE-ID' }, terminationReason: 'PRIVATE-ERROR',
    fullyIdle: 'PRIVATE-FLAG', executionNum: 'PRIVATE-COUNTER',
    invocationNum: -1,
  });
  assert.equal(event.terminationCategory, 'unclassified');
  assert.equal('correlationId' in event, false);
  assert.equal('fullyIdle' in event, false);
  assert.equal('executionNum' in event, false);
  assert.equal('invocationNum' in event, false);
  assert.equal(JSON.stringify(event).includes('PRIVATE-'), false);
});

test('Codex correlation uses only session and turn identity', () => {
  const input = { session_id: 'thr_123', turn_id: 'turn_456', prompt: 'PRIVATE-PROMPT',
    last_assistant_message: 'PRIVATE-RESPONSE', tool_input: 'PRIVATE-INPUT',
    tool_response: 'PRIVATE-OUTPUT', transcript_path: 'PRIVATE-TRANSCRIPT' };
  const start = sanitizeProbeEvent('codex-cli', 'UserPromptSubmit', input);
  const interrupt = sanitizeProbeEvent('codex-cli', 'Interrupt', input);
  assert.equal(start.correlationId, interrupt.correlationId);
  assert.equal(start.turnId, interrupt.turnId);
  assert.equal(JSON.stringify([start, interrupt]).includes('PRIVATE-'), false);
  assert.notEqual(start.turnId, input.turn_id);
});

test('invalid source, event, and payload cannot inject arbitrary probe records', () => {
  assert.equal(sanitizeProbeEvent('unknown', 'Stop', {}), null);
  assert.equal(sanitizeProbeEvent('__proto__', 'Stop', {}), null);
  assert.equal(sanitizeProbeEvent('constructor', 'Stop', {}), null);
  assert.equal(sanitizeProbeEvent('antigravity-ide', 'PRIVATE-EVENT', {}), null);
  assert.equal(sanitizeProbeEvent('codex-cli', 'Stop', []), null);
});

test('hook CLI writes only sanitized metadata, returns neutral JSON, and never contacts Core', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ascend-probe-test-'));
  const log = join(directory, 'events.jsonl');
  const result = spawnSync(process.execPath, [resolve('scripts/phase3-hook-probe.mjs'),
    '--source', 'antigravity-ide', '--event', 'Stop', '--output', log], {
    input: JSON.stringify({ conversationId: 'conversation-123', fullyIdle: true,
      terminationReason: 'model_stop', prompt: 'PRIVATE-PROMPT',
      error: 'PRIVATE-ERROR', transcriptPath: 'PRIVATE-TRANSCRIPT' }),
    encoding: 'utf8', timeout: 3000,
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'stop' });
  assert.equal(result.stderr, '');
  const stored = readFileSync(log, 'utf8');
  assert.equal(stored.includes('PRIVATE-'), false);
  assert.equal(JSON.parse(stored).event, 'Stop');
  assert.deepEqual(readdirSync(directory), ['events.jsonl']);
});

test('malformed/oversized input and unwritable output never block or fail the agent', () => {
  for (const input of ['{bad json', 'x'.repeat(1024 * 1024 + 1), '{}']) {
    const result = spawnSync(process.execPath, [resolve('scripts/phase3-hook-probe.mjs'),
      '--source', 'antigravity-ide', '--event', 'PostInvocation',
      '--output', join(tmpdir(), 'missing-ascend-probe-directory', 'events.jsonl')], {
      input, encoding: 'utf8', timeout: 3000,
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(result.stderr, '');
  }
});
