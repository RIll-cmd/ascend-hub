import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { branchDiff, commitAll, createWorktree, finishWorktree, linkDependencies, runCheck } from '../../scripts/agent-room/project.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });

function repo() {
  const base = mkdtempSync(join(tmpdir(), 'room-repo-'));
  const dir = join(base, 'repo');
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(dir, 'app.js'), 'one\n');
  mkdirSync(join(dir, 'node_modules'));
  mkdirSync(join(dir, 'client', 'node_modules'), { recursive: true });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return { base, dir, worktree: join(base, 'wt') };
}

test('a worktree on a new branch starts from the repo HEAD and shares its dependencies', () => {
  const { dir, worktree } = repo();
  const info = createWorktree(dir, worktree, 'room/demo-1');
  assert.equal(info.baseBranch, 'main');
  assert.match(info.base, /^[0-9a-f]{7,}$/);
  assert.equal(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'room/demo-1');
  linkDependencies(dir, worktree);
  assert.ok(lstatSync(join(worktree, 'node_modules')).isSymbolicLink());
  assert.ok(lstatSync(join(worktree, 'client', 'node_modules')).isSymbolicLink());
  writeFileSync(join(worktree, 'app.js'), 'two\n');
  assert.ok(commitAll(worktree, 'task-1: change'));
  assert.match(branchDiff(worktree, info.base), /\+two/);
  assert.equal(git(dir, 'status', '--porcelain').stdout, '', 'the main checkout is untouched');
});

test('checks run asynchronously and report exit code, time and the end of the output', async () => {
  const { dir } = repo();
  const pass = await runCheck(dir, 'node -e "console.log(\'all good\')"');
  assert.equal(pass.ok, true);
  assert.equal(pass.code, 0);
  assert.match(pass.output, /all good/);
  const fail = await runCheck(dir, 'node -e "console.error(\'boom\'); process.exit(3)"');
  assert.deepEqual([fail.ok, fail.code], [false, 3]);
  assert.match(fail.output, /boom/);
  const slow = await runCheck(dir, 'node -e "setTimeout(() => {}, 60000)"', { timeoutMs: 500 });
  assert.equal(slow.ok, false);
  assert.match(slow.output, /timed out/);
  const controller = new AbortController();
  const stopped = runCheck(dir, 'node -e "setTimeout(() => {}, 60000)"', { signal: controller.signal });
  controller.abort();
  assert.match((await stopped).output, /stopped/);
});

test('merge fast-forwards the base branch, keep leaves the branch, reject deletes it; the worktree goes away', () => {
  for (const decision of ['merge', 'keep', 'reject']) {
    const { dir, worktree } = repo();
    const info = createWorktree(dir, worktree, 'room/demo-2');
    linkDependencies(dir, worktree);
    writeFileSync(join(worktree, 'app.js'), 'two\n');
    commitAll(worktree, 'task-1: change');
    finishWorktree(dir, worktree, 'room/demo-2', info.baseBranch, decision);
    assert.equal(existsSync(worktree), false, decision);
    assert.ok(existsSync(join(dir, 'node_modules')), 'shared dependencies survive');
    const branches = git(dir, 'branch', '--list', 'room/demo-2').stdout.trim();
    assert.equal(Boolean(branches), decision !== 'reject', decision);
    const main = git(dir, 'log', '-1', '--format=%s', 'main').stdout.trim();
    assert.equal(main, decision === 'merge' ? 'task-1: change' : 'init', decision);
  }
});

test('merge refuses when the main checkout moved to another branch, and keeps the worktree', () => {
  const { dir, worktree } = repo();
  const info = createWorktree(dir, worktree, 'room/demo-3');
  writeFileSync(join(worktree, 'app.js'), 'two\n');
  commitAll(worktree, 'task-1: change');
  git(dir, 'switch', '-q', '-c', 'other');
  assert.throws(() => finishWorktree(dir, worktree, 'room/demo-3', info.baseBranch, 'merge'), /MERGE_REFUSED/);
  assert.ok(existsSync(worktree));
});
