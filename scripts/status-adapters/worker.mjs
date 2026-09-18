import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig, readProducerCredential } from './config.mjs';
import { LocalStatusStore } from './local-store.mjs';
import { StatusReporter } from './reporter.mjs';

let store;
let reporter;
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });
process.on('SIGINT', () => { stopped = true; });
try {
  const config = readConfig(process.argv[2]);
  store = new LocalStatusStore(config.storePath, config.instanceId);
  reporter = new StatusReporter(store, { endpoint: config.endpoint,
    credential: readProducerCredential(config.credentialPath), emitterId: randomBytes(12).toString('hex') });
  while (!stopped) {
    await reporter.tick();
    const state = store.snapshot(Date.now(), true);
    const pending = store.db.prepare('SELECT pending,attempts FROM emitter').get();
    const owners = store.db.prepare('SELECT COUNT(*) AS count FROM owners WHERE expires_at>?').get(Date.now()).count;
    if (!state.online && owners === 0 && (!pending.pending || pending.attempts >= 3)) break;
    await delay(200);
  }
} catch { /* Reporter startup failure is never surfaced as agent context or raw logs. */ }
finally { try { reporter?.releaseLease(); store?.close(); } catch { /* Bounded exit. */ } }
