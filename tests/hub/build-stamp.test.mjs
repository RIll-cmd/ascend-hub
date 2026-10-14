import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { isBuildFresh, readSourceStamp, sourceStamp, writeBuildStamp } from '../../scripts/build-stamp.mjs';

const base = { head: 'abc123', diff: '', untracked: '' };

test('same sources give the same stamp', () => {
  assert.equal(sourceStamp(base), sourceStamp({ ...base }));
});

test('a new commit, a second edit to a dirty file, or a new untracked file changes the stamp', () => {
  const stamp = sourceStamp(base);
  assert.notEqual(sourceStamp({ ...base, head: 'def456' }), stamp);
  assert.notEqual(sourceStamp({ ...base, diff: '+a' }), sourceStamp({ ...base, diff: '+ab' }));
  assert.notEqual(sourceStamp({ ...base, untracked: 'app/new.ts 10 1' }), stamp);
});

test('a build is fresh only when dist holds the matching stamp', () => {
  const root = mkdtempSync(join(tmpdir(), 'stamp-'));
  assert.equal(isBuildFresh(root, 'x'), false);
  mkdirSync(join(root, 'dist'));
  writeBuildStamp(root, 'x');
  assert.equal(isBuildFresh(root, 'x'), true);
  assert.equal(isBuildFresh(root, 'y'), false);
  writeFileSync(join(root, 'dist', '.build-stamp'), '');
  assert.equal(isBuildFresh(root, ''), false);
});

test('notes, docs and tests never force a rebuild, source edits do', () => {
  const root = mkdtempSync(join(tmpdir(), 'stamp-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  mkdirSync(join(root, 'app'));
  writeFileSync(join(root, 'app', 'page.tsx'), 'a');
  const stamp = readSourceStamp(root);
  writeFileSync(join(root, 'NOTES.md'), 'note');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'plan.txt'), 'plan');
  mkdirSync(join(root, '.claude'));
  writeFileSync(join(root, '.claude', 'x.json'), '{}');
  assert.equal(readSourceStamp(root), stamp);
  writeFileSync(join(root, 'app', 'page.tsx'), 'ab');
  assert.notEqual(readSourceStamp(root), stamp);
});

test('non-ASCII untracked names and repeated edits to a tracked dirty file are handled', () => {
  const root = mkdtempSync(join(tmpdir(), 'stamp-git2-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  mkdirSync(join(root, 'app'));
  writeFileSync(join(root, 'app', 'page.tsx'), 'one');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  writeFileSync(join(root, 'app', 'café.ts'), 'x');
  const first = readSourceStamp(root);
  writeFileSync(join(root, 'app', 'page.tsx'), 'two');
  const second = readSourceStamp(root);
  writeFileSync(join(root, 'app', 'page.tsx'), 'three!');
  assert.notEqual(second, first);
  assert.notEqual(readSourceStamp(root), second);
});
