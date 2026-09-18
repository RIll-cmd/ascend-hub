import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function launcher() {
  const adapter = await import('../../scripts/status-adapters/antigravity-launch.mjs').catch(() => null);
  assert.ok(adapter, 'The production Antigravity launcher is required');
  return adapter;
}

test('only installed live-probed Antigravity versions pass preflight', async () => {
  const { validateAntigravityVersion } = await launcher();
  for (const stdout of ['1.2.5\n', '1.2.6\n']) assert.doesNotThrow(() => validateAntigravityVersion({ stdout, status: 0 }));
  for (const result of [{ stdout: '1.3.0', status: 0 }, { stdout: '1.2.6', status: 1 }, { error: { code: 'ETIMEDOUT' } }]) {
    assert.throws(() => validateAntigravityVersion(result), /VERSION_/);
  }
});

test('workspace hook installation preserves existing customization and repeated install is safe', async () => {
  const { installAntigravityHooks, verifyAntigravityHooks } = await launcher();
  const workspace = mkdtempSync(join(tmpdir(), 'ascend-agy-hook-install-'));
  mkdirSync(join(workspace, '.agents'));
  const path = join(workspace, '.agents', 'hooks.json');
  const original = { unrelated: { enabled: true, Stop: [{ command: 'existing-safe-handler', timeout: 5 }] } };
  writeFileSync(path, JSON.stringify(original));
  installAntigravityHooks(workspace);
  installAntigravityHooks(workspace);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).unrelated, original.unrelated);
  assert.equal(verifyAntigravityHooks(workspace), true);
});

test('hook installation fails safely for conflicting named hook and malformed existing JSON', async () => {
  const { installAntigravityHooks } = await launcher();
  const workspace = mkdtempSync(join(tmpdir(), 'ascend-agy-hook-conflict-'));
  mkdirSync(join(workspace, '.agents'));
  const path = join(workspace, '.agents', 'hooks.json');
  for (const content of ['PRIVATE-BROKEN-JSON', JSON.stringify({ 'ascend-status-antigravity-cli': { enabled: false } })]) {
    writeFileSync(path, content);
    assert.throws(() => installAntigravityHooks(workspace), /HOOK_/);
    assert.equal(readFileSync(path, 'utf8'), content);
  }
});

test('hook commands execute through native Windows cmd arguments and return neutral unwrapped output', async () => {
  const { antigravityHookDefinition } = await launcher();
  const definition = antigravityHookDefinition();
  const workspace = mkdtempSync(join(tmpdir(), 'ascend-agy-command-path-'));
  mkdirSync(join(workspace, '.agents'));
  if (process.platform === 'win32') {
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', definition.Stop[0].command], {
      cwd: join(workspace, '.agents'), encoding: 'utf8', timeout: 3000,
      env: { ...process.env, ASCEND_AGY_STATUS_OWNER: '' }, windowsHide: true,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
  }
  assert.equal(definition.PostToolUse[0].matcher, '.*');
});

test('wrapper arguments cannot bypass workspace hooks, trust, or wrap a different mode', async () => {
  const { validateAntigravityArguments } = await launcher();
  assert.doesNotThrow(() => validateAntigravityArguments([]));
  for (const args of [['--plugin', 'unexpected'], ['--ignore-user-config'], ['--dangerously-skip-permissions'], ['--conversation=old'], ['-c'], ['--workspace', 'other']]) {
    assert.throws(() => validateAntigravityArguments(args), /ARGUMENT/);
  }
});

test('production hook persists only hashes/counters and bounds malformed/oversized input', async t => {
  const storage = await import('../../scripts/status-adapters/antigravity-store.mjs').catch(() => null);
  assert.ok(storage, 'The Antigravity store is required');
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-agy-hook-private-')), 'status.sqlite');
  const store = new storage.AntigravityStatusStore(path, 'test-agy-hook-1');
  t.after(() => store.close());
  const owner = 'a'.repeat(24);
  store.registerOwner(owner);
  const hook = fileURLToPath(new URL('../../scripts/status-adapters/antigravity-hook.mjs', import.meta.url));
  const env = { ...process.env, ASCEND_AGY_STATUS_STORE: path, ASCEND_AGY_STATUS_INSTANCE: 'test-agy-hook-1', ASCEND_AGY_STATUS_OWNER: owner };
  const run = input => spawnSync(process.execPath, ['--no-warnings', hook, 'PreInvocation'], { input, env, encoding: 'utf8', timeout: 3000 });
  const result = run(JSON.stringify({ conversationId: 'conversation', invocationNum: 0, prompt: 'PRIVATE-PROMPT', response: 'PRIVATE-RESPONSE', terminalOutput: 'PRIVATE-TERMINAL' }));
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.equal(result.stderr, '');
  assert.equal(store.snapshot().activeCount, 1);
  for (const input of ['PRIVATE-INVALID-JSON', 'x'.repeat(1024 * 1024 + 1)]) assert.equal(run(input).status, 0);
  store.db.exec('PRAGMA wal_checkpoint(FULL)');
  assert.equal(readFileSync(path).includes(Buffer.from('PRIVATE-')), false);
});

test('production supervisor launches an actual child and durably cleans orphaned work on exit', async t => {
  const { superviseAntigravity } = await launcher();
  const { AntigravityStatusStore } = await import('../../scripts/status-adapters/antigravity-store.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'ascend-agy-supervisor-test-'));
  const childFile = join(dir, 'child.mjs');
  // A real child runs the real production callback; no synthetic data reaches live Core.
  const hook = resolve('scripts/status-adapters/antigravity-hook.mjs');
  writeFileSync(childFile, `import {spawnSync} from 'node:child_process';\nspawnSync(process.execPath, ['--no-warnings', ${JSON.stringify(hook)}, 'PreInvocation'], {input:JSON.stringify({conversationId:'test-conversation',invocationNum:0}),env:process.env});`);
  const config = { storePath: join(dir, 'status.sqlite'), instanceId: 'test-agy-wrapper-1', endpoint: 'http://127.0.0.1:1/api/status/events' };
  await superviseAntigravity({ config, configPath: join(dir, 'missing-config.json'), executable: process.execPath, args: ['--no-warnings', childFile], workspace: dir });
  const store = new AntigravityStatusStore(config.storePath, config.instanceId);
  t.after(() => store.close());
  assert.equal(store.snapshot().activeCount, 0);
  assert.equal(store.snapshot().lastOutcome, 'interrupted-or-abandoned');
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM owners').get().n, 0);
});

test('supervised normal child preserves Stop outcome even when its reporter cannot start', async t => {
  const { superviseAntigravity } = await launcher();
  const { AntigravityStatusStore } = await import('../../scripts/status-adapters/antigravity-store.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'ascend-agy-supervisor-normal-'));
  const childFile = join(dir, 'child.mjs');
  const hook = resolve('scripts/status-adapters/antigravity-hook.mjs');
  writeFileSync(childFile, `import {spawnSync} from 'node:child_process';\nfor (const event of ['PreInvocation','PostInvocation','Stop']) spawnSync(process.execPath,['--no-warnings',${JSON.stringify(hook)},event],{input:JSON.stringify({conversationId:'normal-conversation',invocationNum:0,executionNum:0,fullyIdle:true}),env:process.env});`);
  const config = { storePath: join(dir, 'status.sqlite'), instanceId: 'test-agy-normal-1', endpoint: 'http://127.0.0.1:1/api/status/events' };
  await superviseAntigravity({ config, configPath: join(dir, 'missing-config.json'), executable: process.execPath, args: ['--no-warnings', childFile], workspace: dir });
  const store = new AntigravityStatusStore(config.storePath, config.instanceId);
  t.after(() => store.close());
  assert.equal(store.snapshot().activeCount, 0);
  assert.equal(store.snapshot().lastOutcome, 'completed');
});

test('local store failure does not stop the supervised agent and no status secrets reach the child', async () => {
  const { superviseAntigravity } = await launcher();
  const dir = mkdtempSync(join(tmpdir(), 'ascend-agy-agent-failopen-'));
  const blockedPath = join(dir, 'not-a-directory');
  writeFileSync(blockedPath, 'fixture');
  const childFile = join(dir, 'child.mjs');
  const resultPath = join(dir, 'agent-result.json');
  writeFileSync(childFile, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(resultPath)},JSON.stringify({agentRan:true,statusOwnerPresent:Boolean(process.env.ASCEND_AGY_STATUS_OWNER),statusCredentialPresent:Boolean(process.env.ASCEND_STATUS_CREDENTIAL),readCredentialPresent:Boolean(process.env.ASCEND_SHELF_READ_CREDENTIAL)}));`);
  const previous = process.env.ASCEND_STATUS_CREDENTIAL;
  process.env.ASCEND_STATUS_CREDENTIAL = 'PRIVATE-SECRET';
  try {
    await superviseAntigravity({ config: { storePath: join(blockedPath, 'status.sqlite'), instanceId: 'test-agy-failopen-1' },
      configPath: join(dir, 'missing-config.json'), executable: process.execPath, args: [childFile], workspace: dir });
  } finally {
    if (previous === undefined) delete process.env.ASCEND_STATUS_CREDENTIAL;
    else process.env.ASCEND_STATUS_CREDENTIAL = previous;
  }
  assert.deepEqual(JSON.parse(readFileSync(resultPath, 'utf8')), { agentRan: true, statusOwnerPresent: false, statusCredentialPresent: false, readCredentialPresent: false });
});
