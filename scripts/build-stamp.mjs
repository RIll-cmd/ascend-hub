import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAMP = join('dist', '.build-stamp');
// Notes, docs, tests and agent settings never reach the build, so editing them must not force a rebuild.
const IGNORED = ['.', ':(exclude,glob)**/*.md', ':(exclude)docs', ':(exclude)tests', ':(exclude).claude', ':(exclude).superpowers'];

export function sourceStamp({ head, diff, untracked }) {
  return createHash('sha256').update(`${head}\0${diff}\0${untracked}`).digest('hex');
}

// Changed and untracked files are fingerprinted by name, size and mtime, so a second edit to a dirty file still counts
// without reading large binary diffs into memory. -z keeps non-ASCII names unquoted.
export function readSourceStamp(root) {
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const fingerprint = (...args) => git(...args, '-z', '--', ...IGNORED).split('\0').filter(Boolean).map(file => {
    try { const s = statSync(join(root, file)); return `${file} ${s.size} ${s.mtimeMs}`; } catch { return `${file} deleted`; }
  }).join('\n');
  return sourceStamp({
    head: git('rev-parse', 'HEAD').trim(),
    diff: fingerprint('diff', 'HEAD', '--name-only'),
    untracked: fingerprint('ls-files', '--others', '--exclude-standard'),
  });
}

export function isBuildFresh(root, stamp) {
  const file = join(root, STAMP);
  return Boolean(stamp) && existsSync(file) && readFileSync(file, 'utf8').trim() === stamp;
}

export function writeBuildStamp(root, stamp) {
  writeFileSync(join(root, STAMP), `${stamp}\n`);
}
