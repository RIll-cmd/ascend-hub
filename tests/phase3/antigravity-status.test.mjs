import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { StatusReporter } from '../../scripts/status-adapters/reporter.mjs';

async function fixture(t) {
  const lifecycle = await import('../../scripts/status-adapters/antigravity-lifecycle.mjs').catch(() => null);
  const storage = await import('../../scripts/status-adapters/antigravity-store.mjs').catch(() => null);
  assert.ok(lifecycle && storage, 'The production Antigravity lifecycle/store is required');
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-agy-test-')), 'status.sqlite');
  const store = new storage.AntigravityStatusStore(path, 'test-agy-1');
  t.after(() => store.close());
  const owner = 'a'.repeat(24);
  store.registerOwner(owner, 0);
  store.startWrapper(owner, 0);
  const apply = (event, invocation = 0, now = 0, session = 'conversation-1', extra = {}) => {
    store.renewOwner(owner, now);
    const input = { conversationId: session, ...extra };
    if (event === 'PreInvocation' || event === 'PostInvocation') input.invocationNum = invocation;
    if (event === 'Stop') Object.assign(input, { executionNum: invocation, fullyIdle: extra.fullyIdle ?? true });
    store.apply(lifecycle.sanitizeAntigravityLifecycle(event, input), owner, now);
  };
  return { store, apply, owner, path, lifecycle, storage };
}

test('PreInvocation starts work and PostInvocation only refreshes the matching invocation', async t => {
  const { store, apply } = await fixture(t);
  assert.equal(store.snapshot(0, true).state, 'idle');
  apply('PreInvocation');
  apply('PostInvocation', 9, 80_000);
  assert.equal(store.snapshot(90_000, true).state, 'stuck');
  apply('PostInvocation', 0, 90_001);
  assert.equal(store.snapshot(90_001, true).state, 'working');
  assert.equal(store.snapshot(90_001, true).activeCount, 1);
});

test('only fully idle Stop closes its conversation while concurrent conversations remain working', async t => {
  const { store, apply } = await fixture(t);
  apply('PreInvocation');
  apply('PreInvocation', 0, 1, 'conversation-2');
  apply('Stop', 0, 2, 'conversation-1', { fullyIdle: false });
  assert.equal(store.snapshot(2, true).activeCount, 2);
  apply('Stop', 0, 3);
  assert.equal(store.snapshot(3, true).activeCount, 1);
  assert.equal(store.snapshot(3, true).state, 'working');
  apply('Stop', 0, 4, 'conversation-2');
  assert.equal(store.snapshot(4, true).lastOutcome, 'completed');
});

test('PostToolUse refreshes safe progress for its conversation without storing tool data', async t => {
  const { store, apply } = await fixture(t);
  apply('PreInvocation');
  apply('PostToolUse', 0, 89_000, 'conversation-1', { toolInput: 'PRIVATE-INPUT', toolOutput: 'PRIVATE-OUTPUT' });
  assert.equal(store.snapshot(90_000, true).state, 'working');
  assert.equal(store.snapshot(179_000, true).state, 'stuck');
});

test('normal child exit preserves terminal Stop results and cleanup is idempotent', async t => {
  const { store, apply, owner } = await fixture(t);
  apply('PreInvocation');
  apply('Stop', 0, 10);
  store.releaseOwner(owner, 11);
  store.releaseOwner(owner, 12);
  assert.equal(store.snapshot(12, true).activeCount, 0);
  assert.equal(store.snapshot(12, true).lastOutcome, 'completed');
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM operations WHERE outcome IS NOT NULL').get().n, 1);
});

test('child exit closes all orphaned invocations as interrupted-or-abandoned without rewriting terminal work', async t => {
  const { store, apply, owner } = await fixture(t);
  apply('PreInvocation');
  apply('Stop', 0, 1);
  apply('PreInvocation', 0, 2, 'conversation-2');
  apply('PreInvocation', 1, 3, 'conversation-2');
  apply('PreInvocation', 0, 4, 'conversation-3');
  store.releaseOwner(owner, 5);
  const outcomes = store.db.prepare('SELECT outcome FROM operations ORDER BY started_at').all().map(r => r.outcome);
  assert.deepEqual(outcomes, ['completed', 'interrupted-or-abandoned', 'interrupted-or-abandoned', 'interrupted-or-abandoned']);
  assert.equal(store.snapshot(5, true).activeCount, 0);
  apply('Stop', 0, 6, 'conversation-2');
  assert.equal(store.snapshot(6, true).lastOutcome, 'interrupted-or-abandoned');
});

test('cleanup is scoped to the exiting wrapper and preserves another owner', async t => {
  const { store, apply, owner, lifecycle } = await fixture(t);
  const second = 'b'.repeat(24);
  store.registerOwner(second, 0);
  store.startWrapper(second, 0);
  apply('PreInvocation');
  store.apply(lifecycle.sanitizeAntigravityLifecycle('PreInvocation', { conversationId: 'conversation-1', invocationNum: 0 }), second, 0);
  store.releaseOwner(owner, 1);
  assert.equal(store.snapshot(1, true).activeCount, 1);
  assert.equal(store.snapshot(1, true).state, 'working');
});

test('duplicate and older invocation hooks do not resurrect or refresh older work', async t => {
  const { store, apply } = await fixture(t);
  apply('PreInvocation');
  apply('PreInvocation');
  assert.equal(store.snapshot(0, true).activeCount, 1);
  apply('PreInvocation', 1, 1);
  apply('PostInvocation', 1, 2);
  apply('PreInvocation', 0, 80_000);
  assert.equal(store.snapshot(90_002, true).state, 'stuck');
  apply('Stop', 0, 90_003);
  apply('Stop', 0, 90_004);
  apply('PostInvocation', 1, 90_005);
  apply('PreInvocation', 1, 90_006);
  assert.equal(store.snapshot(90_006, true).activeCount, 0);
});

test('new turns can reuse invocation zero after a fully idle Stop without changing prior terminal outcomes', async t => {
  const { store, apply } = await fixture(t);
  apply('PreInvocation');
  apply('Stop', 0, 1);
  apply('PreInvocation', 0, 2);
  assert.equal(store.snapshot(2, true).activeCount, 1);
  apply('Stop', 0, 3);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM operations WHERE outcome='completed'").get().n, 2);
});

test('durable reopen preserves work; expired wrapper owner closes it conservatively', async t => {
  const { store, apply, path, storage } = await fixture(t);
  apply('PreInvocation');
  const second = new storage.AntigravityStatusStore(path, 'test-agy-1');
  t.after(() => second.close());
  assert.equal(second.snapshot(1, true).activeCount, 1);
  second.expireOwners(20_001);
  assert.equal(store.snapshot(20_001, true).activeCount, 0);
  assert.equal(store.snapshot(20_001, true).lastOutcome, 'interrupted-or-abandoned');
  assert.throws(() => new storage.AntigravityStatusStore(path, 'different-instance'), /identity/);
});

test('privacy allowlist rejects unsafe identifiers and strips all raw content before persistence', async t => {
  const { store, owner, path, lifecycle } = await fixture(t);
  const input = { conversationId: 'opaque-session', invocationNum: 0,
    prompt: 'PRIVATE-PROMPT', response: 'PRIVATE-RESPONSE', transcriptPath: 'PRIVATE-TRANSCRIPT',
    toolInput: 'PRIVATE-TOOL', error: 'PRIVATE-ERROR', logs: 'PRIVATE-LOGS', code: 'PRIVATE-CODE',
    credential: 'PRIVATE-SECRET', exitCode: 0, account: 'PRIVATE-ACCOUNT' };
  const safe = lifecycle.sanitizeAntigravityLifecycle('PreInvocation', input);
  assert.deepEqual(Object.keys(safe).sort(), ['event', 'invocation', 'sessionId', 'turnId']);
  store.apply(safe, owner, 0);
  store.db.exec('PRAGMA wal_checkpoint(FULL)');
  assert.equal(readFileSync(path).includes(Buffer.from('PRIVATE-')), false);
  assert.throws(() => store.apply({ ...safe, prompt: 'PRIVATE-PROMPT' }, owner, 0), /lifecycle/);
  for (const bad of [null, [], { conversationId: 'invalid space', invocationNum: 0 }, { conversationId: 'valid', invocationNum: -1 }]) {
    assert.equal(lifecycle.sanitizeAntigravityLifecycle('PreInvocation', bad), null);
  }
  assert.equal(lifecycle.sanitizeAntigravityLifecycle('Unknown', input), null);
});

async function reportingFixture(t, options = {}) {
  const base = await fixture(t);
  const received = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ payload: JSON.parse(body), credential: req.headers['x-status-credential'] });
    if (options.hang) return;
    res.writeHead(options.status ?? 202); res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const config = { endpoint: `http://127.0.0.1:${server.address().port}/api/status/events`,
    credential: 'agy-producer.PRIVATE-AGY-ONLY', emitterId: 'c'.repeat(24) };
  const reporter = new StatusReporter(base.store, config);
  const tick = now => { base.store.renewOwner(base.owner, now); return reporter.tick(now); };
  return { ...base, reporter, tick, received, config };
}

test('reporter coalesces progress, sends 10-second heartbeats and isolates agent identity/credential', async t => {
  const { apply, tick, received } = await reportingFixture(t);
  await tick(0);
  apply('PreInvocation', 0, 1); await tick(1);
  for (let now = 100; now < 10_001; now += 100) { apply('PostToolUse', 0, now); await tick(now); }
  assert.equal(received.length, 2);
  await tick(10_001);
  apply('Stop', 0, 10_002); await tick(10_002);
  assert.deepEqual(received.map(r => r.payload.state), ['idle', 'working', 'working', 'idle']);
  assert.deepEqual(received.map(r => r.payload.sequence), [1, 2, 3, 4]);
  assert.ok(received.every(r => r.payload.serviceId === 'antigravity-cli' && r.payload.serviceType === 'agent'));
  assert.ok(received.every(r => r.credential === 'agy-producer.PRIVATE-AGY-ONLY'));
  assert.equal(JSON.stringify(received.map(r => r.payload)).includes('PRIVATE-'), false);
});

test('healthy reporter detects 90-second lifecycle silence; heartbeats never masquerade as progress', async t => {
  const { apply, tick, received } = await reportingFixture(t);
  apply('PreInvocation');
  for (let now = 0; now <= 90_000; now += 10_000) await tick(now);
  assert.equal(received.at(-1).payload.state, 'stuck');
  assert.equal(received.at(-1).payload.issue.code, 'lifecycle-timeout');
  apply('PostToolUse', 0, 90_001); await tick(90_001);
  assert.equal(received.at(-1).payload.state, 'working');
});

test('bounded retries retain the same event id and one pending payload during authority outage', async t => {
  const { apply, tick, received, store } = await reportingFixture(t, { status: 503 });
  apply('PreInvocation');
  for (const now of [0, 2000, 6000, 8000]) await tick(now);
  assert.equal(received.length, 3);
  assert.equal(new Set(received.map(r => r.payload.eventId)).size, 1);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM emitter WHERE pending IS NOT NULL').get().n, 1);
  apply('Stop', 0, 8001); await tick(8001);
  assert.equal(received.at(-1).payload.state, 'idle');
});

test('hanging Core is bounded at two seconds and cannot inject raw content into durable state', async t => {
  const { apply, tick, store, path } = await reportingFixture(t, { hang: true });
  apply('PreInvocation');
  const started = Date.now();
  assert.equal(await tick(0), 'retry');
  assert.ok(Date.now() - started < 3500);
  store.db.exec('PRAGMA wal_checkpoint(FULL)');
  assert.equal(readFileSync(path).includes(Buffer.from('PRIVATE-')), false);
});

test('reporter lease release allows immediate recovery and heartbeats end after final child exit', async t => {
  const { apply, tick, received, reporter, store, owner, config } = await reportingFixture(t);
  apply('PreInvocation'); await tick(0);
  reporter.releaseLease();
  const replacement = new StatusReporter(store, { ...config, emitterId: 'd'.repeat(24) });
  store.releaseOwner(owner, 1);
  assert.equal(await replacement.tick(1), 'sent');
  assert.equal(received.at(-1).payload.metadata.lastOutcome, 'interrupted-or-abandoned');
  const count = received.length;
  await replacement.tick(10_001); await replacement.tick(30_001);
  assert.equal(received.length, count);
  assert.equal(received.at(-1).payload.metadata.activeOperationCount, 0);
});

test('a Codex-owned store cannot be opened by Antigravity even for the same instance name', async t => {
  const { LocalStatusStore } = await import('../../scripts/status-adapters/local-store.mjs');
  const { storage } = await fixture(t);
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-agent-identity-isolation-')), 'status.sqlite');
  const codex = new LocalStatusStore(path, 'same-instance');
  t.after(() => codex.close());
  assert.throws(() => new storage.AntigravityStatusStore(path, 'same-instance'), /identity/);
});

test('terminal retention is bounded and expired tombstones are pruned without retaining heartbeat history', async t => {
  const { store, apply, owner } = await fixture(t);
  apply('PreInvocation'); apply('Stop', 0, 1);
  store.releaseOwner(owner, 2);
  store.expireOwners(86_400_003);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM operations').get().n, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM agy_conversations').get().n, 0);
});
