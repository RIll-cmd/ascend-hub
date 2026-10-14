import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { killTree } from './agents.mjs';
import { roomError } from './paths.mjs';

// autocrlf off: rollback must restore exactly what agents wrote, whatever the user's global git config.
// Hooks, signing and fsmonitor off: agent-written config must not run code or block the room's own git calls.
const IDENTITY = ['-c', 'user.name=Ascend Agent Room', '-c', 'user.email=agent-room@localhost', '-c', 'core.autocrlf=false',
  '-c', `core.hooksPath=${join(tmpdir(), 'ascend-room-no-hooks')}`, '-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false'];

function git(dir, args) {
  const result = spawnSync('git', [...IDENTITY, ...args], { cwd: dir, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 60_000 });
  if (result.error) throw roomError(result.error.code === 'ETIMEDOUT' ? 'GIT_TIMEOUT' : 'GIT_UNAVAILABLE', result.error.message);
  if (result.status !== 0) throw roomError('GIT_FAILED', `git ${args[0]}: ${result.stderr.trim()}`);
  return result.stdout;
}

export function createProject(dir) {
  mkdirSync(dir); // non-recursive on purpose: an existing folder must fail
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n', 'utf8');
  commitAll(dir, 'chore: start project');
}

export function commitAll(dir, message) {
  git(dir, ['add', '-A']);
  if (git(dir, ['status', '--porcelain']).trim() === '') return null;
  git(dir, ['commit', '-q', '--no-verify', '-m', message]);
  return headCommit(dir);
}

export function headCommit(dir) {
  return git(dir, ['rev-parse', '--short', 'HEAD']).trim();
}

// Drops a rejected attempt's commit, so the next try starts from where the task began.
export function resetTo(dir, commit) {
  git(dir, ['reset', '-q', '--hard', commit]);
  git(dir, ['clean', '-fdq']);
}

export function rollback(dir) {
  git(dir, ['reset', '-q', '--hard', 'HEAD']);
  git(dir, ['clean', '-fdq']);
}

// Takes a race winner's commits; the session worktree is clean and the attempt branched from its HEAD.
export function fastForward(dir, branch) {
  git(dir, ['merge', '--ff-only', '-q', branch]);
  return headCommit(dir);
}

export function lastCommitDiff(dir) {
  return git(dir, ['show', '--stat', '--patch', '--format=%s', 'HEAD']);
}

// One task's commit as stat plus patch; capped so a huge generated file cannot flood the page.
export function commitDiff(dir, commit, maxChars = 100_000) {
  const text = git(dir, ['show', '--stat', '--patch', '--no-color', '--format=%s', commit, '--']);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... diff cut at ${maxChars} characters` : text;
}

// Repo sessions work on their own branch in their own worktree; the owner's checkout is never edited.
export function createWorktree(repo, dir, branch) {
  const base = git(repo, ['rev-parse', '--short', 'HEAD']).trim();
  const baseBranch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  mkdirSync(dirname(dir), { recursive: true });
  git(repo, ['worktree', 'add', '-q', '-b', branch, dir, 'HEAD']);
  return { base, baseBranch };
}

// A fresh worktree has no installed packages; link the repo's own (root and one level down) so checks can run.
export function linkDependencies(repo, dir) {
  const subdirs = ['', ...readdirSync(repo, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map(e => e.name)];
  for (const sub of subdirs) {
    const target = join(repo, sub, 'node_modules');
    const link = join(dir, sub, 'node_modules');
    if (!existsSync(target) || existsSync(link)) continue;
    mkdirSync(join(dir, sub), { recursive: true });
    symlinkSync(target, link, 'junction');
  }
}

const CHECK_OUTPUT = 6000;

// Runs the owner's check command without blocking the room; stop and timeout kill the whole process tree.
export function runCheck(dir, command, { timeoutMs = 600_000, signal } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    let output = '';
    let ended = null;
    const child = spawn(command, { cwd: dir, shell: true, windowsHide: true, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
    const keep = chunk => { output = (output + chunk).slice(-CHECK_OUTPUT * 2); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const end = why => { if (!ended) { ended = why; killTree(child); } };
    const timer = setTimeout(() => end(`Check timed out after ${Math.round(timeoutMs / 1000)}s.`), timeoutMs);
    const onAbort = () => end('Check stopped.');
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const tail = output.slice(-CHECK_OUTPUT).trim();
      resolve({ ok: !ended && code === 0, code: ended ? null : code, ms: Date.now() - started, output: ended ? `${tail}\n${ended}`.trim() : tail });
    });
    child.on('error', error => end(`Check could not start: ${error.message}`));
  });
}

export function rootCommit(dir) {
  return git(dir, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n').at(-1);
}

// What a repo's checks should run, unless the owner types their own: configured first, then package.json or pytest.
export function suggestCheck(repo, checks = {}) {
  const configured = Object.entries(checks).find(([dir]) => dir.toLowerCase() === repo.toLowerCase())?.[1];
  if (configured) return configured;
  try {
    if (JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts?.test) return 'npm test';
  } catch { /* no package.json */ }
  return existsSync(join(repo, 'pytest.ini')) ? 'python -m pytest -q' : '';
}

export function branchDiff(dir, base, maxChars = 150_000) {
  const text = git(dir, ['diff', '--stat', '--patch', '--no-color', `${base}..HEAD`, '--']);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... diff cut at ${maxChars} characters` : text;
}

// merge: fast-forward the base branch only if the owner's checkout still sits on it; keep: leave the branch; reject: delete it.
export function finishWorktree(repo, dir, branch, baseBranch, decision) {
  if (decision === 'merge') {
    const current = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    if (current !== baseBranch) throw roomError('MERGE_REFUSED', `The repo is on ${current}, not ${baseBranch}. Switch back or keep the branch.`);
    try {
      git(repo, ['merge', '--ff-only', '-q', branch]);
    } catch (error) {
      throw roomError('MERGE_REFUSED', `${baseBranch} cannot fast-forward to ${branch}: ${error.message}`);
    }
  }
  // Links first, so removing the worktree can never reach into the repo's real node_modules.
  for (const sub of existsSync(dir) ? ['', ...readdirSync(dir)] : []) {
    const link = join(dir, sub, 'node_modules');
    try { if (lstatSync(link).isSymbolicLink()) unlinkSync(link); } catch { /* not there */ }
  }
  if (existsSync(dir)) git(repo, ['worktree', 'remove', '--force', dir]);
  git(repo, ['worktree', 'prune']);
  if (decision === 'reject') git(repo, ['branch', '-D', branch]);
}

export function renderPlan(tasks) {
  return ['# Plan', '', ...tasks.map(t => `${t.id}. **${t.title}** (${t.assignee})\n   ${t.description.replace(/\n/g, '\n   ')}`), ''].join('\n');
}
