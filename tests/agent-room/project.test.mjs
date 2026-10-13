import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { commitAll, createProject, lastCommitDiff, renderPlan, rollback } from '../../scripts/agent-room/project.mjs';

const log = dir => spawnSync('git', ['log', '--format=%s|%an'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n');

test('creates a git project with a first commit by the room', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ascend-room-project-')), 'todo');
  createProject(dir);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\n');
  assert.deepEqual(log(dir), ['chore: start project|Ascend Agent Room']);
  assert.throws(() => createProject(dir), /EEXIST/);
});

test('commits changes, returns null when nothing changed, and shows the last diff', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ascend-room-project-')), 'p');
  createProject(dir);
  assert.equal(commitAll(dir, 'nothing'), null);
  writeFileSync(join(dir, 'a.txt'), 'hello\n');
  const hash = commitAll(dir, 'task-1: add a');
  assert.match(hash, /^[0-9a-f]{7,}$/);
  assert.equal(log(dir)[0], 'task-1: add a|Ascend Agent Room');
  assert.match(lastCommitDiff(dir), /\+hello/);
});

test('rollback discards uncommitted edits and new files only', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ascend-room-project-')), 'p');
  createProject(dir);
  writeFileSync(join(dir, 'kept.txt'), 'v1\n');
  commitAll(dir, 'keep');
  writeFileSync(join(dir, 'kept.txt'), 'v2\n');
  writeFileSync(join(dir, 'new.txt'), 'x');
  rollback(dir);
  assert.equal(readFileSync(join(dir, 'kept.txt'), 'utf8'), 'v1\n');
  assert.equal(existsSync(join(dir, 'new.txt')), false);
});

test('renders the plan as Markdown', () => {
  assert.equal(renderPlan([{ id: 1, title: 'Scaffold', assignee: 'claude', description: 'Line one\nLine two' }]),
    '# Plan\n\n1. **Scaffold** (claude)\n   Line one\n   Line two\n');
});
