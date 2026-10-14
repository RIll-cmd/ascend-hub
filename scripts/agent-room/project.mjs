import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

export function rollback(dir) {
  git(dir, ['reset', '-q', '--hard', 'HEAD']);
  git(dir, ['clean', '-fdq']);
}

export function lastCommitDiff(dir) {
  return git(dir, ['show', '--stat', '--patch', '--format=%s', 'HEAD']);
}

// One task's commit as stat plus patch; capped so a huge generated file cannot flood the page.
export function commitDiff(dir, commit, maxChars = 100_000) {
  const text = git(dir, ['show', '--stat', '--patch', '--no-color', '--format=%s', commit, '--']);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... diff cut at ${maxChars} characters` : text;
}

export function renderPlan(tasks) {
  return ['# Plan', '', ...tasks.map(t => `${t.id}. **${t.title}** (${t.assignee})\n   ${t.description.replace(/\n/g, '\n   ')}`), ''].join('\n');
}
