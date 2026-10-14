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

// The diff catches repeated edits to an already-dirty file; names, sizes and mtimes catch new untracked files.
export function readSourceStamp(root) {
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...IGNORED).split('\n').filter(Boolean)
    .map(file => { const s = statSync(join(root, file)); return `${file} ${s.size} ${s.mtimeMs}`; }).join('\n');
  return sourceStamp({ head: git('rev-parse', 'HEAD').trim(), diff: git('diff', 'HEAD', '--binary', '--', ...IGNORED), untracked });
}

export function isBuildFresh(root, stamp) {
  const file = join(root, STAMP);
  return Boolean(stamp) && existsSync(file) && readFileSync(file, 'utf8').trim() === stamp;
}

export function writeBuildStamp(root, stamp) {
  writeFileSync(join(root, STAMP), `${stamp}\n`);
}
