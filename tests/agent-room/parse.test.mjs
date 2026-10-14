import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJsonBlock, isReady, validatePlan, validateReassign, validateRoles, validateVerdict } from '../../scripts/agent-room/parse.mjs';

test('uses the last fenced json block and ignores surrounding prose', () => {
  const text = 'Thoughts...\n```json\n{"a":1}\n```\nOn reflection:\n```json\n{"a":2}\n```\nDone.';
  assert.deepEqual(extractJsonBlock(text), { ok: true, value: { a: 2 } });
});

test('reports a missing or broken json block with a reason', () => {
  assert.equal(extractJsonBlock('no block here').ok, false);
  assert.match(extractJsonBlock('no block here').error, /No ```json block/);
  const broken = extractJsonBlock('```json\n{"a":}\n```');
  assert.equal(broken.ok, false);
  assert.match(broken.error, /not valid JSON/);
});

test('validates roles', () => {
  assert.deepEqual(validateRoles({ orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null }),
    { ok: true, value: { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null } });
  assert.deepEqual(validateRoles({ orchestrator: 'codex', coders: ['codex'] }).value.reviewer, null);
  for (const bad of [null, [], { orchestrator: 'gpt', coders: ['claude'] }, { orchestrator: 'codex', coders: [] },
    { orchestrator: 'codex', coders: ['claude', 'claude'] }, { orchestrator: 'codex', coders: ['claude'], reviewer: 'me' }]) {
    assert.equal(validateRoles(bad).ok, false, JSON.stringify(bad));
  }
});

test('validates a plan, renumbers ids and flattens titles', () => {
  const plan = validatePlan({ tasks: [{ id: 9, title: ' Scaffold\nproject ', assignee: 'claude', description: 'Set up.' }] }, ['claude']);
  assert.deepEqual(plan, { ok: true, value: { tasks: [{ id: 1, title: 'Scaffold project', assignee: 'claude', description: 'Set up.' }] } });
  assert.equal(validatePlan({ tasks: [] }, ['claude']).ok, false);
  assert.equal(validatePlan({ tasks: Array.from({ length: 21 }, () => ({ title: 't', assignee: 'claude', description: '' })) }, ['claude']).ok, false);
  assert.match(validatePlan({ tasks: [{ title: 't', assignee: 'agy', description: '' }] }, ['claude']).error, /assignee must be one of the coders: claude/);
  assert.equal(validatePlan({ tasks: [{ title: 'x'.repeat(121), assignee: 'claude', description: '' }] }, ['claude']).ok, false);
  assert.equal(validatePlan({ tasks: [{ title: 't', assignee: 'claude', description: 'x'.repeat(2001) }] }, ['claude']).ok, false);
});

test('validates review verdicts and reassign decisions', () => {
  assert.deepEqual(validateVerdict({ verdict: 'changes', notes: 'fix x' }), { ok: true, value: { verdict: 'changes', notes: 'fix x' } });
  assert.deepEqual(validateVerdict({ verdict: 'ok' }).value, { verdict: 'ok', notes: '' });
  assert.equal(validateVerdict({ verdict: 'maybe' }).ok, false);
  assert.deepEqual(validateReassign({ action: 'skip' }, ['claude'], 'claude').value, { action: 'skip' });
  assert.deepEqual(validateReassign({ action: 'reassign', to: 'agy' }, ['claude', 'agy'], 'claude').value, { action: 'reassign', to: 'agy' });
  assert.equal(validateReassign({ action: 'reassign', to: 'claude' }, ['claude', 'agy'], 'claude').ok, false);
});

test('detects the ready marker', () => {
  assert.equal(isReady('Sounds good. [READY]'), true);
  assert.equal(isReady('Not yet.'), false);
});
