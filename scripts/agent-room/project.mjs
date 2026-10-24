import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
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

// Adds one pattern to the repository's local exclude file (shared by all its worktrees); never committed.
export function excludeFromGit(dir, pattern) {
  const file = resolve(dir, git(dir, ['rev-parse', '--git-path', 'info/exclude']).trim());
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (current.split(/\r?\n/).includes(pattern)) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`, 'utf8');
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

// One merge-queue step: the task branch lands as a single commit; a conflict leaves the session worktree as it was.
// keepConflict leaves a conflicted merge in place (markers in the files) for an arbiter; otherwise it is rolled back.
export function squashMerge(dir, branch, message, { keepConflict = false } = {}) {
  try {
    git(dir, ['merge', '--squash', '-q', branch]);
  } catch (error) {
    const files = git(dir, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
    if (!files.length || !keepConflict) rollback(dir);
    if (!files.length) throw error;
    return { conflict: files };
  }
  return { commit: commitAll(dir, message) };
}

// The files that still hold a git conflict marker line; a deleted file counts as resolved.
export function conflictMarkers(dir, files) {
  return files.filter(file => existsSync(join(dir, file)) && /^(<{7}|={7}|>{7})(?: |$)/m.test(readFileSync(join(dir, file), 'utf8')));
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
const CHECK_LOG = 2_000_000;

// Runs the owner's check command without blocking the room; stop and timeout kill the whole process tree.
export function runCheck(dir, command, { timeoutMs = 600_000, signal } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    let output = '';
    // The whole output for the Checks pane, up to CHECK_LOG; output keeps only the tail the agents are shown.
    let log = '';
    let ended = null;
    const child = spawn(command, { cwd: dir, shell: true, windowsHide: true, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
    const keep = chunk => {
      output = (output + chunk).slice(-CHECK_OUTPUT * 2);
      if (log.length < CHECK_LOG) log += String(chunk).slice(0, CHECK_LOG - log.length);
    };
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
      const full = `${log}${log.length >= CHECK_LOG ? `\n[output cut at ${CHECK_LOG.toLocaleString('en-US')} characters]` : ''}${ended ? `\n${ended}` : ''}`;
      resolve({ ok: !ended && code === 0, code: ended ? null : code, ms: Date.now() - started, output: ended ? `${tail}\n${ended}`.trim() : tail, log: full });
    });
    child.on('error', error => end(`Check could not start: ${error.message}`));
  });
}

// The total coverage percent from a coverage report's summary: c8/istanbul "All files | 84.21", Node's test runner
// "ℹ all files | 84.21" (or with "#" under the TAP reporter), or pytest-cov "TOTAL ... 84%". The last match wins; null when there is none.
export function coveragePercent(text) {
  const patterns = [/^[^\w\n|]*all files\s*\|\s*([\d.]+)/gim, /^TOTAL\s.*?(\d+(?:\.\d+)?)%\s*$/gm];
  const found = patterns.flatMap(p => [...String(text).matchAll(p)].map(m => ({ at: m.index, value: Number(m[1]) })));
  const last = found.sort((a, b) => a.at - b.at).at(-1);
  return last && Number.isFinite(last.value) && last.value <= 100 ? last.value : null;
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

const NEW_FILES = 20;
const NEW_FILE_CHARS = 20_000;

// A new untracked file as an all-added patch; binary or very large files are named only.
function newFilePatch(dir, file) {
  const path = join(dir, file);
  let body = null;
  try {
    if (statSync(path).size <= 1_000_000) {
      const buf = readFileSync(path);
      if (!buf.includes(0)) body = buf.toString('utf8');
    }
  } catch { /* deleted while reading */ }
  if (body === null) return `new file ${file} (binary, large or unreadable)\n`;
  const lines = body.slice(0, NEW_FILE_CHARS).replace(/\n$/, '').split('\n');
  const cut = body.length > NEW_FILE_CHARS ? `\n... cut at ${NEW_FILE_CHARS} characters` : '';
  return `diff --git a/${file} b/${file}\nnew file\n--- /dev/null\n+++ b/${file}\n${lines.map(l => `+${l}`).join('\n')}${cut}\n`;
}

// What an agent has changed but not committed: the patch against HEAD plus new untracked files.
// --no-optional-locks keeps these reads from refreshing the index while the agent works in the same folder.
export function workingDiff(dir, maxChars = 150_000) {
  const read = args => git(dir, ['--no-optional-locks', ...args]);
  const tracked = read(['diff', '--stat', '--patch', '--no-color', 'HEAD', '--']);
  const changed = read(['diff', '--name-only', 'HEAD', '--']).split('\n').filter(Boolean);
  const untracked = read(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const more = untracked.length > NEW_FILES ? `... and ${untracked.length - NEW_FILES} more new files\n` : '';
  const text = [tracked, ...untracked.slice(0, NEW_FILES).map(f => newFilePatch(dir, f)), more].filter(Boolean).join('\n');
  return { files: changed.length + untracked.length, text: text.length > maxChars ? `${text.slice(0, maxChars)}\n... diff cut at ${maxChars} characters` : text };
}

const MAX_FILES = 5000;
const MAX_VIEW_BYTES = 512 * 1024;

// The files git knows in a session folder: tracked ones plus new ones that are not ignored, so .env files, node_modules and
// other ignored output never show. Sorted, at most MAX_FILES.
export function projectFiles(dir) {
  const files = git(dir, ['--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const present = [...new Set(files)].filter(f => existsSync(join(dir, f))).sort();
  return { files: present.slice(0, MAX_FILES), more: Math.max(0, present.length - MAX_FILES) };
}

// The files committed at HEAD; what an @file reference in a repo session's task may name.
export function trackedFiles(dir) {
  return git(dir, ['--no-optional-locks', 'ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean);
}

// One file for the read-only viewer. Only a path projectFiles lists, that is a regular file (never a link) whose real path is
// inside dir; binary or large files come back without their text.
export function projectFile(dir, file) {
  if (typeof file !== 'string' || !projectFiles(dir).files.includes(file)) throw roomError('FILE_NOT_LISTED');
  const path = join(dir, file);
  const info = lstatSync(path);
  const root = realpathSync(dir);
  if (!info.isFile() || !realpathSync(path).startsWith(`${root}${sep}`)) throw roomError('FILE_NOT_LISTED');
  if (info.size > MAX_VIEW_BYTES) return { path: file, size: info.size, tooLarge: true };
  const buf = readFileSync(path);
  return buf.includes(0) ? { path: file, size: info.size, binary: true } : { path: file, size: info.size, text: buf.toString('utf8') };
}

export function branchDiff(dir, base, maxChars = 150_000, head = 'HEAD') {
  const text = git(dir, ['diff', '--stat', '--patch', '--no-color', `${base}..${head}`, '--']);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... diff cut at ${maxChars} characters` : text;
}

export function deleteBranch(dir, branch) {
  git(dir, ['branch', '-D', branch]);
}

// Pushes the session branch to origin and opens a pull request with gh; the gate stays open if either step fails.
export function openPullRequest(repo, branch, baseBranch, { title, body, gh = { command: 'gh', prefixArgs: [] } }) {
  try {
    git(repo, ['remote', 'get-url', 'origin']);
  } catch {
    throw roomError('PR_FAILED', 'The repo has no origin remote to push to.');
  }
  try {
    git(repo, ['push', '-q', '-u', 'origin', branch]);
  } catch (error) {
    throw roomError('PR_FAILED', `Push failed: ${error.message}`);
  }
  const result = spawnSync(gh.command, [...gh.prefixArgs, 'pr', 'create', '--base', baseBranch, '--head', branch, '--title', title, '--body', body],
    { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (result.error || result.status !== 0) throw roomError('PR_FAILED', (result.stderr || result.error?.message || 'gh pr create failed').trim().slice(-300));
  return result.stdout.trim().split('\n').at(-1);
}

const GH_KINDS = { issue: 'issues', pr: 'pull' };

// "123", "#123" or a github.com issue / pull link of the matching kind; anything else is refused before gh runs.
export function githubRef(kind, ref) {
  const text = String(ref ?? '').trim();
  const number = /^#?(\d{1,7})$/.exec(text)?.[1];
  if (number) return number;
  const link = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull)\/(\d{1,7})\/?$/.exec(text);
  if (link && link[1] === GH_KINDS[kind]) return link[0];
  throw roomError('GITHUB_REF_INVALID', `Give the ${kind === 'pr' ? 'pull request' : 'issue'} as a number or its github.com link.`);
}

function gh(repo, args, settings) {
  const { command, prefixArgs } = settings ?? { command: 'gh', prefixArgs: [] };
  const result = spawnSync(command, [...prefixArgs, ...args], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw roomError('GITHUB_FAILED', (result.stderr || result.error?.message || `gh ${args[0]} ${args[1]} failed`).trim().slice(-300));
  return result.stdout;
}

// An issue or pull request of the repo's GitHub remote, read with gh; a pull request also brings its diff.
export function githubItem(repo, kind, ref, settings) {
  const target = githubRef(kind, ref);
  const fields = kind === 'pr' ? 'number,title,body,url,baseRefName,headRefName' : 'number,title,body,url,comments';
  const item = JSON.parse(gh(repo, [kind, 'view', target, '--json', fields], settings));
  const comments = (item.comments ?? []).slice(-5).map(c => `${c.author?.login ?? 'someone'}: ${String(c.body ?? '').trim()}`).join('\n\n');
  return {
    number: item.number, title: String(item.title ?? ''), url: item.url, body: String(item.body ?? '').trim(),
    ...(comments ? { comments } : {}),
    ...(kind === 'pr' ? { base: item.baseRefName, head: item.headRefName, diff: gh(repo, ['pr', 'diff', target], settings) } : {}),
  };
}

// A comment-only review (never approve or request changes); the body travels as a file, so nothing is shell-quoted.
export function postPrReview(repo, number, bodyFile, settings) {
  gh(repo, ['pr', 'review', String(number), '--comment', '--body-file', bodyFile], settings);
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
