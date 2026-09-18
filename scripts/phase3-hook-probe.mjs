// Temporary compatibility probe. No Core client, credentials, or status emission.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const events = {
  'antigravity-ide': new Set(['PreInvocation', 'PostInvocation', 'PostToolUse', 'Stop']),
  'codex-cli': new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
    'Stop', 'Interrupt', 'SessionEnd']),
};
const terminationCategories = new Set(['model_stop', 'max_steps_exceeded', 'error',
  'cancelled', 'canceled', 'interrupted', 'user_cancelled', 'user_canceled']);

function opaqueId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) return undefined;
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function sanitizeProbeEvent(source, event, input) {
  if (!Object.hasOwn(events, source) || !events[source].has(event)
      || !input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  // Build a fresh object. Never spread the hook payload or inspect transcript/tool content.
  const record = { timestamp: new Date().toISOString(), source, event };
  const id = opaqueId(source === 'antigravity-ide' ? input.conversationId : input.session_id);
  if (id) record.correlationId = id;
  if (source === 'codex-cli') {
    const turn = opaqueId(input.turn_id);
    if (turn) record.turnId = turn;
    if (typeof input.stop_hook_active === 'boolean') record.stopHookActive = input.stop_hook_active;
  } else {
    for (const key of ['invocationNum', 'executionNum', 'stepIdx']) {
      if (Number.isSafeInteger(input[key]) && input[key] >= 0 && input[key] <= 1_000_000) {
        record[key] = input[key];
      }
    }
    if (typeof input.fullyIdle === 'boolean') record.fullyIdle = input.fullyIdle;
    if (typeof input.terminationReason === 'string') {
      record.terminationCategory = terminationCategories.has(input.terminationReason)
        ? input.terminationReason : 'unclassified';
    }
  }
  return record;
}

function run() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  const source = option('--source');
  const event = option('--event');
  const output = option('--output');
  let finished = false;
  let bytes = 0;
  const chunks = [];
  const finish = (input) => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    try {
      const record = sanitizeProbeEvent(source, event, input);
      if (record && output) appendFileSync(output, JSON.stringify(record) + '\n', { mode: 0o600 });
    } catch {
      // A failed probe must not affect the AI task or disclose its input/error.
    }
    const neutral = source === 'antigravity-ide' && event === 'Stop'
      ? { decision: 'stop' } : {};
    process.stdout.write(JSON.stringify(neutral) + '\n', () => process.exit(0));
  };
  const deadline = setTimeout(() => finish(null), 1250);
  process.stdin.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) {
      chunks.length = 0;
      process.stdin.pause();
      finish(null);
    } else chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { finish(null); }
  });
  process.stdin.on('error', () => finish(null));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
