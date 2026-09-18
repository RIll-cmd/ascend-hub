import { AntigravityStatusStore } from './antigravity-store.mjs';
import { sanitizeAntigravityLifecycle } from './antigravity-lifecycle.mjs';

const event = process.argv[2];
const owner = process.env.ASCEND_AGY_STATUS_OWNER;
let done = false;
let bytes = 0;
const chunks = [];
const finish = input => {
  if (done) return;
  done = true;
  clearTimeout(deadline);
  let store;
  try {
    const record = sanitizeAntigravityLifecycle(event, input);
    if (record && /^[a-f0-9]{24}$/.test(owner ?? '')) {
      store = new AntigravityStatusStore(process.env.ASCEND_AGY_STATUS_STORE, process.env.ASCEND_AGY_STATUS_INSTANCE);
      store.apply(record, owner);
    }
  } catch { /* Neutral hook: raw input and errors never enter agent context or logs. */ }
  finally { try { store?.close(); } catch { /* Failure contained. */ } }
  process.stdout.write(event === 'Stop' ? '{"decision":"allow"}\n' : '{}\n', () => process.exit(0));
};
const deadline = setTimeout(() => finish(null), 1000);
if (!/^[a-f0-9]{24}$/.test(owner ?? '')) finish(null);
else {
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
}
