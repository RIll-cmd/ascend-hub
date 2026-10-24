import { isAbsolute, relative, resolve, sep } from 'node:path';

// Commands an agent turn must never run: the room does its own pushing, resetting and cleaning.
const NEVER = [
  [/\bgit\s+push\b/i, 'pushes to a remote'],
  [/\bgit\s+reset\s+--hard\b/i, 'throws away commits and changes'],
  [/\bgit\s+clean\s+-\w*f/i, 'deletes untracked files'],
  [/\bgit\s+(?:branch\s+-D|worktree\s+remove|filter-branch|update-ref\s+-d)\b/, 'deletes or rewrites branches'],
  [/\bnpm\s+publish\b/i, 'publishes a package'],
];

const DELETERS = new Set(['rm', 'remove-item', 'ri', 'rmdir', 'rd', 'del', 'erase']);
const unquote = token => token.replace(/^[`"']+|[`"']+$/g, '');
const isRecursive = flag => /^--recursive$/i.test(flag) || /^-recurse$/i.test(flag) || /^\/s$/i.test(flag) || (/^-[a-z]{1,3}$/i.test(flag) && /r/i.test(flag));

// Deleting cwd itself, its .git, or anything outside it (or a path the shell would expand, like ~ or $HOME).
function outside(path, cwd) {
  if (/^[~$%]/.test(path)) return true;
  const rel = relative(cwd, resolve(cwd, path));
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel === '.git' || rel.startsWith(`.git${sep}`);
}

// { command, why } when the command is one the room stops, else null. cwd is the session folder or worktree.
// Segments are split on ; & | and newlines, which also splits inside a quoted wrapper like powershell -Command "a; b".
export function dangerousCommand(command, cwd) {
  for (const [pattern, why] of NEVER) if (pattern.test(command)) return { command, why };
  for (const segment of command.split(/[;&|\n]+/)) {
    const tokens = segment.trim().split(/\s+/).map(unquote).filter(Boolean);
    const at = tokens.findIndex(t => DELETERS.has(t.toLowerCase().replace(/\.exe$/, '').split(/[\\/]/).pop()));
    if (at < 0) continue;
    const args = tokens.slice(at + 1);
    if (!args.some(isRecursive)) continue;
    const paths = args.filter(a => !a.startsWith('-') && !/^\/[a-z]$/i.test(a));
    if (paths.some(p => outside(p, cwd))) return { command, why: 'deletes files outside the session folder' };
  }
  return null;
}
