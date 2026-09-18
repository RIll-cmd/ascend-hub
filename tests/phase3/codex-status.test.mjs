import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function fixture(t) {
  const lifecycle = await import('../../scripts/status-adapters/codex-lifecycle.mjs').catch(() => null);
  const storage = await import('../../scripts/status-adapters/local-store.mjs').catch(() => null);
  assert.ok(lifecycle && storage, 'A durable Codex lifecycle store is required');
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-status-test-')), 'status.sqlite');
  const store = new storage.LocalStatusStore(path, 'test-codex-1');
  t.after(() => store.close());
  const owner = 'a'.repeat(24);
  store.registerOwner(owner, 0);
  const apply = (event, turn = 'turn-1', now = 0, session = 'session-1') => {
    store.renewOwner(owner, now); // Simulate the live supervised launcher, independently of operation progress.
    store.apply(lifecycle.sanitizeCodexLifecycle(event, { session_id: session, turn_id: turn }), owner, now);
  };
  return { store, apply, path, owner, lifecycle, storage };
}

test('UserPromptSubmit starts work; Stop completes only its correlated turn', async (t) => {
  const { store, apply } = await fixture(t);
  apply('SessionStart');
  assert.equal(store.snapshot(0, true).state, 'idle');
  apply('UserPromptSubmit', 'turn-1', 100);
  assert.equal(store.snapshot(100, true).state, 'working');
  apply('Stop', 'turn-1', 200);
  assert.equal(store.snapshot(200, true).state, 'idle');
  assert.equal(store.snapshot(200, true).lastOutcome, 'completed');
});

async function reporterFixture(t, options = {}) {
  const base = await fixture(t);
  const reporting = await import('../../scripts/status-adapters/reporter.mjs').catch(() => null);
  assert.ok(reporting, 'A durable leased reporter is required');
  const { createServer } = await import('node:http');
  const received = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ body: JSON.parse(body), credential: req.headers['x-status-credential'] });
    if (options.hang) return;
    res.writeHead(options.status ?? 202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true, duplicate: false, outOfOrder: false }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const config = { endpoint: `http://127.0.0.1:${server.address().port}/api/status/events`,
    credential: 'codex-producer.PRIVATE-CREDENTIAL', emitterId: 'b'.repeat(24) };
  const reporter = new reporting.StatusReporter(base.store, config);
  const tick = async (now) => { base.store.renewOwner(base.owner, now); return reporter.tick(now); };
  return { ...base, reporter, reporting, config, tick, received };
}

test('reporter emits transitions immediately, coalesces tool noise, and heartbeats every 10 seconds', async (t) => {
  const { apply, tick, received } = await reporterFixture(t);
  apply('SessionStart');
  await tick(0);
  apply('UserPromptSubmit', 'turn-1', 100);
  await tick(100);
  for (let now = 200; now < 10_100; now += 100) { apply('PostToolUse', 'turn-1', now); await tick(now); }
  assert.equal(received.length, 2);
  await tick(10_100);
  assert.equal(received.length, 3);
  apply('Stop', 'turn-1', 10_200);
  await tick(10_200);
  assert.deepEqual(received.map(r => r.body.state), ['idle', 'working', 'working', 'idle']);
  assert.deepEqual(received.map(r => r.body.sequence), [1, 2, 3, 4]);
  assert.ok(received.every(r => r.body.serviceId === 'codex-cli' && r.body.serviceType === 'agent'));
  assert.equal(JSON.stringify(received.map(r => r.body)).includes('PRIVATE-'), false);
  assert.equal(received[0].credential, 'codex-producer.PRIVATE-CREDENTIAL');
});

test('only one durable emitter sends; reopening preserves sequence and operation state', async (t) => {
  const { apply, tick, received, store, path, storage, reporting, config } = await reporterFixture(t);
  apply('UserPromptSubmit');
  await tick(0);
  const second = new storage.LocalStatusStore(path, 'test-codex-1');
  t.after(() => second.close());
  const competitor = new reporting.StatusReporter(second, { ...config, emitterId: 'c'.repeat(24) });
  assert.equal(await competitor.tick(1), 'leased');
  assert.equal(received.length, 1);
  store.renewOwner('a'.repeat(24), 16_000);
  await competitor.tick(16_000);
  assert.equal(received.length, 2);
  assert.equal(received[1].body.sequence, 2);
  assert.equal(received[1].body.state, 'working');
});

test('Core 5xx retries the same eventId at most three times, then waits for a new heartbeat', async (t) => {
  const { apply, tick, received, store } = await reporterFixture(t, { status: 503 });
  apply('UserPromptSubmit');
  assert.equal(await tick(0), 'retry');
  await tick(1000);
  await tick(2000);
  await tick(6000);
  await tick(9000);
  assert.equal(received.length, 3);
  assert.equal(new Set(received.map(r => r.body.eventId)).size, 1);
  assert.equal(new Set(received.map(r => r.body.sequence)).size, 1);
  assert.equal(store.db.prepare('SELECT last_failure FROM emitter').get().last_failure, 'authority-unavailable');
  await tick(10_000);
  assert.equal(received.length, 4);
  assert.equal(received[3].body.sequence, 2);
});

test('a completion supersedes an unavailable working event and concurrent work remains working', async (t) => {
  const { apply, tick, received } = await reporterFixture(t, { status: 503 });
  apply('UserPromptSubmit');
  await tick(0);
  apply('UserPromptSubmit', 'turn-2', 1);
  apply('Stop', 'turn-1', 2);
  await tick(2);
  assert.equal(received.at(-1).body.state, 'working');
  assert.equal(received.at(-1).body.metadata.activeOperationCount, 1);
  apply('Interrupt', 'turn-2', 3);
  await tick(3);
  assert.equal(received.at(-1).body.state, 'idle');
  assert.equal(received.at(-1).body.metadata.lastOutcome, 'interrupted');
});

test('heartbeats do not refresh operation progress and reporter stops after its final owner exits', async (t) => {
  const { apply, tick, received, store, owner, reporter } = await reporterFixture(t);
  apply('UserPromptSubmit');
  for (let now = 0; now <= 90_000; now += 10_000) await tick(now);
  assert.equal(received.at(-1).body.state, 'stuck');
  assert.equal(received.at(-1).body.issue.code, 'lifecycle-timeout');
  store.releaseOwner(owner, 90_001);
  await reporter.tick(90_001);
  const count = received.length;
  await reporter.tick(100_001);
  await reporter.tick(120_001);
  assert.equal(received.length, count);
});

test('reporter times out a hanging authority without leaking error or credential into durable state', async (t) => {
  const { apply, tick, store, path } = await reporterFixture(t, { hang: true });
  apply('UserPromptSubmit');
  const started = Date.now();
  assert.equal(await tick(0), 'retry');
  assert.ok(Date.now() - started < 3500);
  store.db.exec('PRAGMA wal_checkpoint(FULL)');
  assert.equal(readFileSync(path).includes(Buffer.from('PRIVATE-')), false);
  assert.equal(store.db.prepare('SELECT attempts FROM emitter').get().attempts, 1);
});

test('rolling local write budget keeps rapid transitions and retries below Core producer limit', async (t) => {
  const { apply, tick, received } = await reporterFixture(t);
  for (let i = 0; i < 100; i++) {
    apply('UserPromptSubmit', `turn-${i}`, i * 2);
    await tick(i * 2);
    apply('Stop', `turn-${i}`, i * 2 + 1);
    await tick(i * 2 + 1);
  }
  assert.equal(received.length, 55);
  await tick(60_001);
  assert.equal(received.at(-1).body.state, 'idle');
});

test('idle heartbeats preserve stateSince instead of restarting the idle timestamp', async (t) => {
  const { apply, tick, received } = await reporterFixture(t);
  apply('SessionStart');
  await tick(0);
  await tick(10_000);
  assert.equal(received[0].body.stateSince, '1970-01-01T00:00:00.000Z');
  assert.equal(received[1].body.stateSince, received[0].body.stateSince);
});

test('clean reporter shutdown releases its lease so a new emitter can resume immediately', async (t) => {
  const { apply, tick, reporter, reporting, store, config, received } = await reporterFixture(t);
  apply('UserPromptSubmit');
  await tick(0);
  reporter.releaseLease();
  const next = new reporting.StatusReporter(store, { ...config, emitterId: 'c'.repeat(24) });
  apply('Stop', 'turn-1', 1);
  assert.equal(await next.tick(1), 'sent');
  assert.equal(received.at(-1).body.state, 'idle');
});

test('a launcher alone is not an idle-ready signal; presence begins with a verified session hook', async (t) => {
  const { apply, tick, received } = await reporterFixture(t);
  await tick(0);
  assert.equal(received.length, 0);
  apply('SessionStart', 'turn-1', 1);
  await tick(1);
  assert.equal(received.length, 1);
  assert.equal(received[0].body.state, 'idle');
});

test('unexpected durable outcome text cannot cross the outgoing status allowlist', async (t) => {
  const { apply, tick, received, store } = await reporterFixture(t);
  apply('Stop');
  store.db.prepare('UPDATE operations SET outcome=?').run('PRIVATE-UNEXPECTED-DURABLE-CONTENT');
  await tick(1);
  assert.equal(JSON.stringify(received[0].body).includes('PRIVATE-'), false);
  assert.equal('lastOutcome' in received[0].body.metadata, false);
});

test('Interrupt ends work as interrupted, never completed or stuck', async (t) => {
  const { store, apply } = await fixture(t);
  apply('UserPromptSubmit');
  apply('Interrupt', 'turn-1', 100);
  assert.equal(store.snapshot(100, true).state, 'idle');
  assert.equal(store.snapshot(100, true).lastOutcome, 'interrupted');
  apply('Stop', 'turn-1', 200);
  assert.equal(store.snapshot(200, true).lastOutcome, 'interrupted');
});

test('overlapping sessions and duplicate hooks never cause premature idle', async (t) => {
  const { store, apply } = await fixture(t);
  apply('UserPromptSubmit');
  apply('UserPromptSubmit');
  apply('UserPromptSubmit', 'turn-1', 10, 'session-2');
  assert.equal(store.snapshot(10, true).activeCount, 2);
  apply('Stop', 'turn-1', 20);
  apply('Stop', 'turn-1', 30);
  assert.equal(store.snapshot(30, true).activeCount, 1);
  assert.equal(store.snapshot(30, true).state, 'working');
  apply('Interrupt', 'turn-1', 40, 'session-2');
  assert.equal(store.snapshot(40, true).state, 'idle');
});

test('terminal tombstones prevent a late start/progress from resurrecting a turn', async (t) => {
  const { store, apply } = await fixture(t);
  apply('Stop');
  apply('UserPromptSubmit', 'turn-1', 100);
  apply('PostToolUse', 'turn-1', 200);
  assert.equal(store.snapshot(200, true).activeCount, 0);
  apply('SessionEnd', 'turn-1', 300);
  apply('UserPromptSubmit', 'new-turn', 400);
  assert.equal(store.snapshot(400, true).activeCount, 0);
});

test('SessionEnd cleans only that session; owner expiry abandons remaining work', async (t) => {
  const { store, apply } = await fixture(t);
  apply('UserPromptSubmit');
  apply('UserPromptSubmit', 'turn-2', 1, 'session-2');
  apply('SessionEnd', 'turn-1', 2);
  assert.equal(store.snapshot(2, true).activeCount, 1);
  store.expireOwners(20_003);
  assert.equal(store.snapshot(20_003, true).activeCount, 0);
  assert.equal(store.snapshot(20_003, true).online, false);
});

test('durable operations survive reopening and another SQLite connection sees completions', async (t) => {
  const { apply, path, storage } = await fixture(t);
  apply('UserPromptSubmit');
  const second = new storage.LocalStatusStore(path, 'test-codex-1');
  t.after(() => second.close());
  assert.equal(second.snapshot(10, true).activeCount, 1);
  apply('Stop', 'turn-1', 100);
  assert.equal(second.snapshot(100, true).activeCount, 0);
  assert.throws(() => new storage.LocalStatusStore(path, 'other-instance'), /identity/);
});

test('90-second lifecycle silence is stuck only with a healthy reporter; progress recovers', async (t) => {
  const { store, apply } = await fixture(t);
  apply('UserPromptSubmit');
  assert.equal(store.snapshot(89_999, true).state, 'working');
  assert.equal(store.snapshot(90_000, false).state, 'working');
  assert.equal(store.snapshot(90_000, true).state, 'stuck');
  apply('PreToolUse', 'turn-1', 90_001);
  assert.equal(store.snapshot(90_001, true).state, 'working');
  for (let now = 150_000; now <= 450_000; now += 60_000) apply('PostToolUse', 'turn-1', now);
  assert.equal(store.snapshot(450_001, true).state, 'working');
});

test('allowlisted lifecycle metadata drops content before storage; malformed IDs are rejected', async (t) => {
  const { store, owner, path, lifecycle } = await fixture(t);
  const safe = lifecycle.sanitizeCodexLifecycle('UserPromptSubmit', {
    session_id: 'session-private', turn_id: 'turn-private',
    prompt: 'PRIVATE-PROMPT', response: 'PRIVATE-RESPONSE', transcript_path: 'PRIVATE-PATH',
    tool_input: 'PRIVATE-INPUT', tool_response: 'PRIVATE-OUTPUT',
    error: 'PRIVATE-ERROR', logs: 'PRIVATE-LOG', code: 'PRIVATE-CODE', credential: 'PRIVATE-SECRET',
  });
  assert.deepEqual(Object.keys(safe).sort(), ['event', 'sessionId', 'turnId']);
  store.apply(safe, owner, 0);
  store.db.exec('PRAGMA wal_checkpoint(FULL)');
  assert.equal(readFileSync(path).includes(Buffer.from('PRIVATE-')), false);
  assert.equal(lifecycle.sanitizeCodexLifecycle('Stop', { session_id: 'bad id', turn_id: 'turn' }), null);
  assert.equal(lifecycle.sanitizeCodexLifecycle('Unknown', { session_id: 'session' }), null);
  assert.equal(lifecycle.sanitizeCodexLifecycle('Stop', { session_id: 'session' }), null);
  assert.throws(() => store.apply({ ...safe, prompt: 'PRIVATE-PROMPT' }, owner, 0), /lifecycle/);
});
