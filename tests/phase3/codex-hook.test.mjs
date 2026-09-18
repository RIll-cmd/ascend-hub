import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { LocalStatusStore } from '../../scripts/status-adapters/local-store.mjs';

const hookPath = resolve('scripts/status-adapters/codex-hook.mjs');

test('actual hook subprocess is neutral, persists only allowlisted lifecycle, and needs no network/credential', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-hook-test-')), 'status.sqlite');
  const store = new LocalStatusStore(path, 'test-codex-1');
  const owner = 'a'.repeat(24);
  store.registerOwner(owner);
  for (const [event, state, outcome] of [['UserPromptSubmit', 'working', null], ['Interrupt', 'idle', 'interrupted']]) {
    const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', hookPath,
      path, 'test-codex-1', owner, event], {
      input: JSON.stringify({ session_id: 'session-1', turn_id: 'turn-1',
        prompt: 'PRIVATE-PROMPT', last_assistant_message: 'PRIVATE-RESPONSE',
        transcript_path: 'PRIVATE-PATH', tool_input: 'PRIVATE-INPUT', error: 'PRIVATE-ERROR' }),
      encoding: 'utf8', timeout: 3000,
    });
    assert.equal(result.status, 0, 'The hook must return neutral success');
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(result.stderr, '');
    const snapshot = store.snapshot(Date.now(), true);
    assert.equal(snapshot.state, state);
    assert.equal(snapshot.lastOutcome, outcome);
  }
  store.close();
});

test('malformed/oversized input and a contended/unavailable store cannot fail Codex', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-hook-test-')), 'status.sqlite');
  const store = new LocalStatusStore(path, 'test-codex-1');
  const owner = 'a'.repeat(24);
  store.registerOwner(owner);
  store.db.exec('BEGIN IMMEDIATE');
  for (const input of ['{invalid', 'x'.repeat(1024 * 1024 + 1), JSON.stringify({ session_id: 'session-1', turn_id: 'turn-1' })]) {
    const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', hookPath,
      path, 'test-codex-1', owner, 'UserPromptSubmit'], { input, encoding: 'utf8', timeout: 3000 });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(result.stderr, '');
  }
  store.db.exec('ROLLBACK');
  store.close();
});

test('explicit launcher preserves native hook argument quoting and keeps normal trust/auth settings', async () => {
  const launcher = await import('../../scripts/status-adapters/codex-launch.mjs').catch(() => null);
  assert.ok(launcher, 'A verified explicit session launcher is required');
  const args = launcher.buildStatusHookOverrides({ storePath: 'C:/Users/Cyrill Gerard/Temp/status.sqlite',
    instanceId: 'test-codex-1', ownerId: 'a'.repeat(24) });
  const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ...args], { encoding: 'utf8' });
  const received = JSON.parse(result.stdout);
  assert.equal(received.length, 16);
  assert.equal(received[0], '--enable');
  assert.equal(received[1], 'hooks');
  const stop = received.find(arg => arg.startsWith('hooks.Stop='));
  assert.ok(stop.includes('"C:/Users/Cyrill Gerard/Temp/status.sqlite"'));
  assert.ok(stop.includes('commandWindows'));
  assert.equal(received.includes('--dangerously-bypass-hook-trust'), false);
  assert.equal(received.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(received.some(arg => arg.includes('PRIVATE-')), false);
});

test('launcher configuration rejects secrets and caller overrides that replace status hooks or identity', async () => {
  const launcher = await import('../../scripts/status-adapters/codex-launch.mjs').catch(() => null);
  assert.ok(launcher, 'A safe Codex launcher is required');
  for (const args of [['-c', 'hooks.Stop=[]'], ['--config=hooks.Stop=[]'], ['--disable', 'hooks'],
    ['--dangerously-bypass-hook-trust'], ['--remote', 'ws://example'], ['exec']]) {
    assert.throws(() => launcher.validateCodexArguments(args), /Unsupported/);
  }
  assert.doesNotThrow(() => launcher.validateCodexArguments(['--sandbox', 'read-only', '--ask-for-approval', 'on-request']));
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-config-test-')), 'config.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, instanceId: 'test-codex-1', coreEventsUrl: 'http://127.0.0.1:8000/api/status/events', credential: 'PRIVATE-SECRET' }));
  assert.throws(() => launcher.readConfig(path), /Invalid/);
});

test('a reporter terminated by signal is eligible for supervised durable restart', async (t) => {
  const launcher = await import('../../scripts/status-adapters/codex-launch.mjs');
  assert.equal(typeof launcher.isWorkerRunning, 'function', 'The watchdog must distinguish signaled exit from a live worker');
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'ignore', windowsHide: true });
  t.after(() => { if (worker.exitCode === null && worker.signalCode === null) worker.kill(); });
  assert.equal(launcher.isWorkerRunning(worker), true);
  const exited = once(worker, 'exit');
  worker.kill('SIGTERM');
  await exited;
  assert.equal(launcher.isWorkerRunning(worker), false);
});

test('version preflight distinguishes fixed failure codes without revealing subprocess content', async () => {
  const { validateCodexVersion } = await import('../../scripts/status-adapters/codex-launch.mjs');
  assert.equal(typeof validateCodexVersion, 'function');
  for (const [result, code] of [
    [{ status: null, error: { code: 'ETIMEDOUT', message: 'PRIVATE-ERROR' } }, 'VERSION_TIMEOUT'],
    [{ status: null, error: { code: 'ENOENT', message: 'PRIVATE-PATH' } }, 'VERSION_EXECUTABLE_UNAVAILABLE'],
    [{ status: 1, stdout: 'PRIVATE-OUTPUT', stderr: 'PRIVATE-ERROR' }, 'VERSION_COMMAND_FAILED'],
    [{ status: 0, stdout: 'codex-cli 0.154.0\n' }, 'VERSION_MISMATCH'],
  ]) {
    assert.throws(() => validateCodexVersion(result), error => error.message === code);
  }
  assert.doesNotThrow(() => validateCodexVersion({ status: 0, stdout: 'codex-cli 0.153.4\r\n' }));
});

test('actual launcher reports an unavailable executable safely before creating state or running hooks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ascend-launch-preflight-'));
  const result = spawnSync(process.execPath, ['--no-warnings', resolve('scripts/status-adapters/codex-launch.mjs'),
    join(dir, 'PRIVATE-CONFIG.json'), join(dir, 'PRIVATE-EXECUTABLE.exe')], {
    encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /\[VERSION_EXECUTABLE_UNAVAILABLE\]/);
  assert.equal(result.stderr.includes('PRIVATE-'), false);
});
