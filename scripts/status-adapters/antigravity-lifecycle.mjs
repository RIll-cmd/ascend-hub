import { createHash } from 'node:crypto';

export const hashLifecycleId = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const mapping = new Map([
  ['PreInvocation', 'start'], ['PostInvocation', 'progress'],
  ['PostToolUse', 'tool-progress'], ['Stop', 'stop'],
]);
const counter = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;

export function sanitizeAntigravityLifecycle(event, input) {
  if (!mapping.has(event) || !input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.conversationId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(input.conversationId)) return null;
  const record = { event: mapping.get(event), sessionId: hashLifecycleId(input.conversationId) };
  if (event === 'PreInvocation' || event === 'PostInvocation') {
    if (!counter(input.invocationNum)) return null;
    record.invocation = input.invocationNum;
    record.turnId = hashLifecycleId(`${input.conversationId}:${input.invocationNum}`);
  }
  if (event === 'Stop') {
    if (!counter(input.executionNum) || typeof input.fullyIdle !== 'boolean') return null;
    record.execution = input.executionNum;
    record.fullyIdle = input.fullyIdle;
  }
  // terminationReason and all text/content fields are intentionally excluded.
  return record;
}
