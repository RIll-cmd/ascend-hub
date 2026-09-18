import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readConfig, readProducerCredential, withoutStatusSecrets } from '../../scripts/status-adapters/config.mjs';
import { validateEndpoint } from '../../scripts/status-adapters/reporter.mjs';

test('Codex inherits normal configuration but no Ascend producer/read credential environment', () => {
  const safe = withoutStatusSecrets({ PATH: 'normal-path', OPENAI_API_KEY: 'account-auth',
    ASCEND_STATUS_CREDENTIAL: 'PRIVATE-PRODUCER', ASCEND_CODEX_STATUS_CREDENTIAL: 'PRIVATE-CODEX',
    ASCEND_SHELF_READ_CREDENTIAL: 'PRIVATE-READ', ASCEND_VISION_TOKEN: 'PRIVATE-VISION',
    ASCEND_CHARACTER_ID: 'normal-configuration' });
  assert.deepEqual(safe, { PATH: 'normal-path', OPENAI_API_KEY: 'account-auth', ASCEND_CHARACTER_ID: 'normal-configuration' });
});

test('only loopback HTTP or HTTPS producer endpoints are accepted; credentials cannot redirect', () => {
  assert.equal(validateEndpoint('http://127.0.0.1:8000/api/status/events'), 'http://127.0.0.1:8000/api/status/events');
  for (const url of ['http://remote.example/api/status/events', 'https://user:password@example/api/status/events',
    'https://example/api/status/events?token=secret', 'https://example/api/status/shelf']) {
    assert.throws(() => validateEndpoint(url), /Invalid/);
  }
});

test('valid private configuration on the Windows user-profile drive is outside the repository', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-private-config-test-')), 'config.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, instanceId: 'test-codex-1', coreEventsUrl: 'http://127.0.0.1:8000/api/status/events' }));
  assert.equal(readConfig(path).instanceId, 'test-codex-1');
});

test('configuration failures identify the exact boundary without exposing file contents or raw errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ascend-config-diagnostics-'));
  assert.throws(() => readConfig(join(dir, 'PRIVATE-MISSING.json')),
    error => error.message === 'Invalid status configuration [CONFIGURATION_NOT_FOUND]');
  for (const [text, code] of [
    ['PRIVATE-INVALID-JSON', 'CONFIGURATION_JSON_INVALID'],
    [JSON.stringify({ schemaVersion: 1, instanceId: 'test-codex-1', coreEventsUrl: 'http://127.0.0.1:8000/api/status/events', credential: 'PRIVATE-SECRET' }), 'CONFIGURATION_SCHEMA_INVALID'],
    [JSON.stringify({ schemaVersion: 1, instanceId: 'test-codex-1', coreEventsUrl: 'https://user:PRIVATE-SECRET@example/api/status/events' }), 'CONFIGURATION_ENDPOINT_INVALID'],
  ]) {
    const path = join(dir, 'config.json');
    writeFileSync(path, text);
    assert.throws(() => readConfig(path), error => error.message === `Invalid status configuration [${code}]`);
  }
});

test('Windows credential is encrypted at rest and decryptable only through the worker boundary', { skip: process.platform !== 'win32' }, () => {
  const encrypted = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Add-Type -AssemblyName System.Security; $bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadLine()); $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); -join ($protected | ForEach-Object { $_.ToString('x2') })"],
  { input: 'fake-codex.PRIVATE-TEST-SECRET\n', encoding: 'utf8', windowsHide: true });
  assert.equal(encrypted.status, 0);
  assert.equal(encrypted.stdout.includes('PRIVATE-'), false);
  const path = join(mkdtempSync(join(tmpdir(), 'ascend-secret-test-')), 'credential.dpapi');
  writeFileSync(path, encrypted.stdout.trim());
  assert.equal(readProducerCredential(path), 'fake-codex.PRIVATE-TEST-SECRET');
});
