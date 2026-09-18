// Operator checks: controlled hooks are explicitly distinguished from real-agent evidence.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig, readProducerCredential, withoutStatusSecrets } from './config.mjs';
import { AntigravityStatusStore } from './antigravity-store.mjs';
import { StatusReporter } from './reporter.mjs';
import { antigravityHookDefinition } from './antigravity-launch.mjs';

const [mode, configPath] = process.argv.slice(2);
if (!['--controlled', '--watch'].includes(mode) || !configPath) {
  console.error('Usage: antigravity-live-check.mjs --controlled|--watch <private-config.json>');
  process.exit(1);
}
const config = readConfig(configPath);
const readCredential = readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)
  .find(line => line.startsWith('ASCEND_SHELF_READ_CREDENTIAL='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
assert.ok(readCredential, 'Existing server-only Shelf read configuration required');
const observations = [];
async function shelf(hub = false) {
  const response = await fetch(hub ? 'http://localhost:5173/api/status/shelf' : config.endpoint.replace(/events$/, 'shelf'), {
    cache: 'no-store', signal: AbortSignal.timeout(3000), headers: hub ? {} : { 'X-Status-Read-Credential': readCredential },
  });
  assert.equal(response.status, 200, 'Shelf read must succeed');
  const data = await response.json();
  assert.equal(data.schemaVersion, 1);
  return data.services;
}
function safeObservation(service) {
  if (!service) return { present: false };
  return { present: true, serviceId: service.serviceId, instanceId: service.instanceId,
    serviceType: service.serviceType, state: service.state,
    activeOperationCount: service.metadata?.activeOperationCount ?? null,
    lastOutcome: service.metadata?.lastOutcome ?? null, lastHeartbeatAt: service.lastHeartbeatAt };
}
async function verify(state, count, check) {
  const find = services => services.find(s => s.serviceId === 'antigravity-cli' && s.instanceId === config.instanceId);
  const core = find(await shelf());
  let hub;
  const deadline = Date.now() + 6000;
  do { hub = find(await shelf(true)); if (hub?.state === state && hub.metadata?.activeOperationCount === count) break; await delay(200); } while (Date.now() < deadline);
  assert.ok(core && hub, 'The service must exist through both unchanged shelf routes');
  assert.equal(core.serviceType, 'agent');
  assert.equal(core.state, state);
  assert.equal(core.metadata.activeOperationCount, count);
  assert.equal(core.staleAfterSeconds, 30);
  assert.equal(hub.state, state);
  observations.push({ check, ...safeObservation(core), hubState: hub.state });
  return core;
}

if (mode === '--watch') {
  let stopped = false;
  process.on('SIGINT', () => { stopped = true; });
  process.on('SIGTERM', () => { stopped = true; });
  let previous;
  const deadline = Date.now() + 10 * 60_000;
  while (!stopped && Date.now() < deadline) {
    try {
      const service = (await shelf()).find(s => s.serviceId === 'antigravity-cli' && s.instanceId === config.instanceId);
      const row = safeObservation(service);
      const fingerprint = JSON.stringify([row.present, row.state, row.activeOperationCount, row.lastOutcome]);
      if (fingerprint !== previous) { console.log(JSON.stringify(row)); previous = fingerprint; }
    } catch { console.log('{"shelfAvailable":false}'); }
    await delay(300);
  }
} else {
  const owner = randomBytes(12).toString('hex');
  const conversationId = `validation-${randomUUID()}`;
  const store = new AntigravityStatusStore(config.storePath, config.instanceId);
  const reporter = new StatusReporter(store, { endpoint: config.endpoint,
    credential: readProducerCredential(config.credentialPath), emitterId: randomBytes(12).toString('hex') });
  store.registerOwner(owner);
  store.startWrapper(owner);
  const renew = setInterval(() => { try { store.renewOwner(owner); } catch { /* Bounded operator check. */ } }, 5000);
  const emit = event => {
    const definition = antigravityHookDefinition();
    const command = definition[event]?.[0]?.command;
    assert.ok(command, 'The installed production lifecycle command must exist');
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
      env: { ...withoutStatusSecrets(process.env), ASCEND_AGY_STATUS_STORE: config.storePath,
        ASCEND_AGY_STATUS_INSTANCE: config.instanceId, ASCEND_AGY_STATUS_OWNER: owner },
      input: JSON.stringify({ conversationId, invocationNum: 0, executionNum: 0, fullyIdle: true }),
      encoding: 'utf8', timeout: 3000,
    });
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
  };
  const tick = async () => {
    let result;
    const deadline = Date.now() + 16_000;
    do { result = await reporter.tick(); if (result !== 'leased') break; await delay(200); } while (Date.now() < deadline);
    assert.equal(result, 'sent', 'The existing producer endpoint must accept the normalized payload');
  };
  try {
    await tick(); await verify('idle', 0, 'wrapper-presence');
    emit('PreInvocation'); await tick(); await verify('working', 1, 'invocation-start');
    const profile = mkdtempSync(join(tmpdir(), 'ascend-agy-hub-browser-'));
    const browser = spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe', [
      '--headless', '--disable-gpu', '--no-first-run', '--incognito', `--user-data-dir=${profile}`,
      '--virtual-time-budget=8000', '--dump-dom', 'http://localhost:5173',
    ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const articles = browser.stdout?.match(/<article\b[\s\S]*?<\/article>/g) ?? [];
    const card = articles.find(article => article.includes(`Generic service, instance ${config.instanceId}, Working`));
    assert.ok(card?.includes('status-service-tv__glyph--generic'), 'The unchanged Hub must render a generic TV');
    emit('PostInvocation'); emit('Stop'); await tick();
    const normal = await verify('idle', 0, 'fully-idle-stop');
    assert.equal(normal.metadata.lastOutcome, 'completed');
    emit('PreInvocation'); await tick(); await verify('working', 1, 'fresh-turn');
    store.releaseOwner(owner); await tick();
    const interrupted = await verify('idle', 0, 'child-boundary-cleanup');
    assert.equal(interrupted.metadata.lastOutcome, 'interrupted-or-abandoned');
    const services = await shelf();
    console.log(JSON.stringify({ result: 'passed', realAgentTask: false,
      validationType: 'controlled production hook callbacks + live Core/Hub', observations,
      genericHubCardRendered: true, independentAgentEntries: services.filter(s => ['codex-cli', 'antigravity-cli'].includes(s.serviceId)).map(safeObservation) }, null, 2));
  } catch {
    console.log(JSON.stringify({ result: 'failed', realAgentTask: false, observations }));
    process.exitCode = 1;
  } finally {
    clearInterval(renew);
    try { store.releaseOwner(owner); await reporter.tick(); reporter.releaseLease(); store.close(); } catch { /* No raw details. */ }
  }
}
