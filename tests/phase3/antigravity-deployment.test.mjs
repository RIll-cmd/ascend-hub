import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AntigravityStatusStore } from '../../scripts/status-adapters/antigravity-store.mjs';

test('host deployment preserves encrypted credential and durable sequence without exposing or overwriting secrets', async t => {
  const deployment = await import('../../scripts/status-adapters/antigravity-deployment.mjs').catch(() => null);
  assert.ok(deployment, 'A safe host deployment export is required');
  const source = mkdtempSync(join(tmpdir(), 'ascend-agy-export-source-'));
  const target = join(mkdtempSync(join(tmpdir(), 'ascend-agy-export-target-')), 'private');
  const config = join(source, 'config.json');
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, instanceId: 'test-agy-export-1', coreEventsUrl: 'http://127.0.0.1:8000/api/status/events' }));
  writeFileSync(join(source, 'credential.dpapi'), 'a'.repeat(128));
  const original = new AntigravityStatusStore(join(source, 'status.sqlite'), 'test-agy-export-1');
  original.db.prepare('UPDATE emitter SET sequence=17').run();
  original.close();
  await deployment.exportAntigravityDeployment(config, target);
  assert.equal(readFileSync(join(target, 'credential.dpapi'), 'utf8'), 'a'.repeat(128));
  assert.equal(readFileSync(join(target, 'config.json'), 'utf8'), readFileSync(config, 'utf8'));
  const copy = new AntigravityStatusStore(join(target, 'status.sqlite'), 'test-agy-export-1');
  t.after(() => copy.close());
  assert.equal(copy.db.prepare('SELECT sequence FROM emitter').get().sequence, 17);
  assert.equal(existsSync(join(source, 'credential.dpapi')), true);
  await assert.rejects(deployment.exportAntigravityDeployment(config, target), /DEPLOYMENT_TARGET_EXISTS/);
});

test('deployment refuses copying an active reporter owner so two stores cannot emit for one instance', async () => {
  const deployment = await import('../../scripts/status-adapters/antigravity-deployment.mjs').catch(() => null);
  assert.ok(deployment, 'A safe host deployment export is required');
  const source = mkdtempSync(join(tmpdir(), 'ascend-agy-export-active-'));
  const target = join(source, 'target');
  const config = join(source, 'config.json');
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, instanceId: 'test-agy-export-1', coreEventsUrl: 'http://127.0.0.1:8000/api/status/events' }));
  writeFileSync(join(source, 'credential.dpapi'), 'b'.repeat(128));
  const store = new AntigravityStatusStore(join(source, 'status.sqlite'), 'test-agy-export-1');
  store.registerOwner('a'.repeat(24));
  store.close();
  await assert.rejects(deployment.exportAntigravityDeployment(config, target), /DEPLOYMENT_SOURCE_ACTIVE/);
  assert.equal(existsSync(target), false);
});
