// Explicit operator validation only. Controlled lifecycle inputs are NOT a real Codex task.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig, readProducerCredential, withoutStatusSecrets } from './config.mjs';
import { LocalStatusStore } from './local-store.mjs';
import { StatusReporter } from './reporter.mjs';

if (process.argv[2] !== '--live' || !process.argv[3]) {
  console.error('Explicit usage: node --no-warnings live-smoke.mjs --live <private-config.json>');
  process.exit(1);
}
const config = readConfig(process.argv[3]);
const owner = randomBytes(12).toString('hex');
const emitterId = randomBytes(12).toString('hex');
const session = `validation-${randomUUID()}`;
const hookPath = fileURLToPath(new URL('./codex-hook.mjs', import.meta.url));
const credential = readProducerCredential(config.credentialPath);
const producerHttpStatuses = [];
const monitoredFetch = async (url, options) => { const response = await fetch(url, options); producerHttpStatuses.push(response.status); return response; };
let store = new LocalStatusStore(config.storePath, config.instanceId);
let reporter = new StatusReporter(store, { endpoint: config.endpoint, credential, emitterId, fetchImpl: monitoredFetch });
store.registerOwner(owner);
const interval = setInterval(() => { try { store.renewOwner(owner); } catch { /* Recovery phase may replace connection. */ } }, 5000);
const observations = [];
const emissionChecks = [];
let validationStage = 'startup';

const readCredential = readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)
  .find(line => line.startsWith('ASCEND_SHELF_READ_CREDENTIAL='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
assert.ok(readCredential, 'Existing server-side Shelf read configuration required');

async function shelf(url, direct = false) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: direct ? { 'X-Status-Read-Credential': readCredential } : {} });
  assert.equal(response.status, 200, 'Shelf read must succeed');
  const data = await response.json();
  assert.equal(data.schemaVersion, 1);
  return data.services.find(service => service.serviceId === 'codex-cli' && service.instanceId === config.instanceId);
}

async function emit(event, turn) {
  validationStage = `emit-${event}`;
  store.renewOwner(owner);
  const result = spawnSync(process.execPath, ['--no-warnings', hookPath, config.storePath, config.instanceId, owner, event], {
    input: JSON.stringify({ session_id: session, turn_id: turn }), encoding: 'utf8', timeout: 3000,
    env: withoutStatusSecrets(process.env),
  });
  validationStage = `hook-result-${event}`;
  emissionChecks.push({ event, exitCode: result.status, stderrEmpty: result.stderr === '' });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.equal(result.stderr, '');
  validationStage = `reporter-${event}`;
  let delivery = await reporter.tick();
  const leaseDeadline = Date.now() + 16_000;
  while (delivery === 'leased' && Date.now() < leaseDeadline) { await delay(200); store.renewOwner(owner); delivery = await reporter.tick(); }
  emissionChecks.at(-1).delivery = delivery;
  assert.equal(delivery, 'sent');
}

async function verify(state, count, label) {
  validationStage = `verify-${label}`;
  const core = await shelf(config.endpoint.replace(/events$/, 'shelf'), true);
  const hub = await shelf('http://localhost:5173/api/status/shelf');
  assert.ok(core && hub, 'Codex must appear through both existing Shelf routes');
  observations.push({ check: label, serviceId: core.serviceId, instanceId: core.instanceId,
    serviceType: core.serviceType, state: core.state, activeOperationCount: core.metadata?.activeOperationCount ?? null,
    lastHeartbeatAt: core.lastHeartbeatAt, lastOutcome: core.metadata?.lastOutcome ?? null,
    hubState: hub.state });
  assert.equal(core.serviceType, 'agent');
  assert.equal(core.state, state);
  assert.equal(core.metadata.activeOperationCount, count);
  assert.equal(core.staleAfterSeconds, 30);
  assert.equal(hub.state, state);
  return core;
}

try {
  await emit('SessionStart');
  await verify('idle', 0, 'SessionStart');
  await emit('UserPromptSubmit', 'normal-turn');
  const first = await verify('working', 1, 'UserPromptSubmit');
  await delay(10_100);
  store.renewOwner(owner);
  assert.equal(await reporter.tick(), 'sent');
  const heartbeat = await verify('working', 1, '10-second heartbeat');
  assert.ok(Date.parse(heartbeat.lastHeartbeatAt) > Date.parse(first.lastHeartbeatAt));
  store.close();
  store = new LocalStatusStore(config.storePath, config.instanceId);
  reporter = new StatusReporter(store, { endpoint: config.endpoint, credential, emitterId, fetchImpl: monitoredFetch });
  assert.equal(store.snapshot(Date.now(), true).activeCount, 1);
  await emit('UserPromptSubmit', 'interrupted-turn');
  await verify('working', 2, 'durable reopen + concurrent start');
  await emit('Stop', 'normal-turn');
  await verify('working', 1, 'Stop while another turn remains');

  // A fresh, isolated headless profile validates existing client polling/rendering; no normal browser profile is touched.
  const profile = mkdtempSync(join(tmpdir(), 'ascend-hub-browser-check-'));
  const browser = spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--incognito', `--user-data-dir=${profile}`,
    '--virtual-time-budget=8000', '--dump-dom', 'http://localhost:5173',
  ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const articles = browser.stdout?.match(/<article\b[\s\S]*?<\/article>/g) ?? [];
  const card = articles.find(article => article.includes(`Generic service, instance ${config.instanceId}, Working`));
  const browserResult = { browserExitCode: browser.status,
    genericCodexCardRendered: Boolean(card && card.includes('status-service-tv__glyph--generic')) };
  assert.equal(browserResult.genericCodexCardRendered, true, 'Existing Hub must render the generic Codex CRT in the browser');

  await emit('Interrupt', 'interrupted-turn');
  const interrupted = await verify('idle', 0, 'Interrupt');
  assert.equal(interrupted.metadata.lastOutcome, 'interrupted');
  await emit('UserPromptSubmit', 'final-normal-turn');
  await emit('Stop', 'final-normal-turn');
  const normal = await verify('idle', 0, 'normal Stop');
  assert.equal(normal.metadata.lastOutcome, 'completed');
  await emit('SessionEnd');
  store.releaseOwner(owner);
  await reporter.tick();
  console.log(JSON.stringify({ result: 'passed', validationType: 'controlled actual adapter hooks + live Core/Hub',
    realCodexAgentTask: false, observations, hubBrowser: browserResult }, null, 2));
} catch {
  console.error('Live Codex status validation failed. No raw response, credential, or error details were logged.');
  console.log(JSON.stringify({ validationStage, producerHttpStatuses, emissionChecks, observedStatusMetadata: observations }, null, 2));
  process.exitCode = 1;
} finally {
  clearInterval(interval);
  try { store.releaseOwner(owner); await reporter.tick(); reporter.releaseLease(); store.close(); } catch { /* Bounded teardown. */ }
}
