import { LocalStatusStore } from './local-store.mjs';
import { sanitizeCodexLifecycle } from './codex-lifecycle.mjs';

const [path, instanceId, ownerId, event] = process.argv.slice(2);
let done = false;
let bytes = 0;
const chunks = [];
const finish = (input) => {
  if (done) return;
  done = true;
  clearTimeout(deadline);
  let store;
  try {
    const record = sanitizeCodexLifecycle(event, input);
    if (record) {
      store = new LocalStatusStore(path, instanceId);
      store.apply(record, ownerId);
    }
  } catch { /* Status failures must not alter Codex or disclose input/error text. */ }
  finally { try { store?.close(); } catch { /* Neutral on every filesystem failure. */ } }
  process.stdout.write('{}\n', () => process.exit(0));
};
const deadline = setTimeout(() => finish(null), 1000);
process.stdin.on('data', chunk => {
  bytes += chunk.length;
  if (bytes > 1024 * 1024) { chunks.length = 0; process.stdin.pause(); finish(null); }
  else chunks.push(chunk);
});
process.stdin.on('end', () => {
  try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { finish(null); }
});
process.stdin.on('error', () => finish(null));
