import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveProjectDir, roomDataDir } from '../../scripts/agent-room/paths.mjs';
import { appendJsonLine, readJson, readJsonLines, writeJsonAtomic } from '../../scripts/agent-room/store.mjs';

const root = () => mkdtempSync(join(tmpdir(), 'ascend-room-paths-'));

test('accepts a valid new project name directly under the builds root', () => {
  const r = root();
  assert.equal(resolveProjectDir(r, 'todo-system'), join(r, 'todo-system'));
});

test('rejects names that could escape or are malformed', () => {
  const r = root();
  for (const bad of ['', '..', '../x', 'a/b', 'a\\b', 'Todo', '-x', 'x'.repeat(41), 'a b', 'c:', 42, undefined]) {
    assert.throws(() => resolveProjectDir(r, bad), { code: 'PROJECT_NAME_INVALID' }, String(bad));
  }
});

test('refuses an existing folder unless resuming', () => {
  const r = root();
  mkdirSync(join(r, 'todo'));
  assert.throws(() => resolveProjectDir(r, 'todo'), { code: 'PROJECT_EXISTS' });
  assert.equal(resolveProjectDir(r, 'todo', { allowExisting: true }), join(r, 'todo'));
});

test('refuses a project path that is a junction or symlink', () => {
  const r = root();
  const elsewhere = mkdtempSync(join(tmpdir(), 'ascend-room-target-'));
  symlinkSync(elsewhere, join(r, 'linked'), 'junction');
  assert.throws(() => resolveProjectDir(r, 'linked', { allowExisting: true }), { code: 'PROJECT_PATH_IS_LINK' });
});

test('refuses a builds root that is itself a junction', () => {
  const parent = root();
  const real = mkdtempSync(join(tmpdir(), 'ascend-room-real-'));
  symlinkSync(real, join(parent, 'builds'), 'junction');
  assert.throws(() => resolveProjectDir(join(parent, 'builds'), 'ok'), { code: 'BUILDS_ROOT_IS_LINK' });
});

test('room data lives in the git-ignored runtime folder', () => {
  assert.equal(roomDataDir('D:\\hub'), join('D:\\hub', '.sites-runtime', 'agent-room'));
});

test('store writes JSON atomically and appends JSON lines', () => {
  const dir = root();
  const file = join(dir, 'nested', 'state.json');
  writeJsonAtomic(file, { a: 1 });
  writeJsonAtomic(file, { a: 2 });
  assert.deepEqual(readJson(file), { a: 2 });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 2 });
  assert.equal(readJson(join(dir, 'missing.json'), 'fallback'), 'fallback');
  const lines = join(dir, 'nested', 't.jsonl');
  appendJsonLine(lines, { n: 1 });
  appendJsonLine(lines, { n: 2 });
  assert.deepEqual(readJsonLines(lines), [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(readJsonLines(join(dir, 'none.jsonl')), []);
});
