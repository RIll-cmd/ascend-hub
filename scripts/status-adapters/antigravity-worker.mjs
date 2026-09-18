import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig, readProducerCredential } from './config.mjs';
import { AntigravityStatusStore } from './antigravity-store.mjs';
import { StatusReporter } from './reporter.mjs';

let store;
let reporter;
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
process.on('SIGINT', () => { stopped = true; });
try {
  const config = readConfig(process.argv[2]);
  store = new AntigravityStatusStore(config.storePath, config.instanceId);
  reporter = new StatusReporter(store, { endpoint: config.endpoint,
    credential: readProducerCredential(config.credentialPath), emitterId: randomBytes(12).toString('hex') });
  while (!stopped) {
    await reporter.tick();
    const pending = store.db.prepare('SELECT pending,attempts FROM emitter').get();
    const owners = store.db.prepare('SELECT COUNT(*) n FROM owners WHERE expires_at>?').get(Date.now()).n;
    if (!owners && (!pending.pending || pending.attempts >= 3)) break;
    await delay(200);
  }
} catch { /* No raw error, producer credential, account identity, or agent content logging. */ }
finally { try { reporter?.releaseLease(); store?.close(); } catch { /* Bounded shutdown. */ } }
