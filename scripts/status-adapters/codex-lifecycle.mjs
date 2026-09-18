import { createHash } from 'node:crypto';

const mapping = new Map([
  ['SessionStart', 'session-start'], ['UserPromptSubmit', 'start'],
  ['PreToolUse', 'progress'], ['PostToolUse', 'progress'],
  ['Stop', 'complete'], ['Interrupt', 'interrupt'], ['SessionEnd', 'session-end'],
]);

function hashId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) return null;
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function sanitizeCodexLifecycle(event, input) {
  if (!mapping.has(event) || !input || typeof input !== 'object' || Array.isArray(input)) return null;
  const sessionId = hashId(input.session_id);
  if (!sessionId) return null;
  const record = { event: mapping.get(event), sessionId };
  if (event !== 'SessionStart' && event !== 'SessionEnd') {
    const turnId = hashId(input.turn_id);
    if (!turnId) return null;
    record.turnId = turnId;
  }
  return record;
}
