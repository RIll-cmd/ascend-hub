import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { extractJsonBlock } from './parse.mjs';
import { roomError } from './paths.mjs';
import { commitAll, createWorktree, finishWorktree, openPullRequest } from './project.mjs';

// Owner-approved notes per project, kept in the room's runtime data, never in the repo.
// Every note should change how an agent works here; the cap keeps prompts short and forces pruning.
const MAX_LINES = 60;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const oneLine = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

export function cleanNotes(value, max = 5) {
  return (Array.isArray(value) ? value : []).map(oneLine).filter(n => n && n.length <= 200).slice(0, max);
}

export function splitProposal(text) {
  const block = extractJsonBlock(text);
  const notes = block.ok ? cleanNotes(block.value?.memory) : [];
  const summary = String(text).replace(/```json\s*\n[\s\S]*?```/g, '').trim();
  return { summary, notes };
}

export function memoryKey({ repo, project }) {
  return repo?.dir ? basename(repo.dir) : project;
}

function file(dataDir, key) {
  if (typeof key !== 'string' || !KEY.test(key)) throw roomError('MEMORY_KEY_INVALID', String(key));
  return join(dataDir, 'memory', `${key}.md`);
}

export function readMemory(dataDir, key) {
  const path = file(dataDir, key);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim()).filter(Boolean);
}

export function writeMemory(dataDir, key, notes) {
  const path = file(dataDir, key);
  const lines = [...new Set(cleanNotes(notes, Infinity))].slice(-MAX_LINES);
  mkdirSync(join(dataDir, 'memory'), { recursive: true });
  writeFileSync(path, `# Project memory: ${key}\n\n${lines.map(l => `- ${l}`).join('\n')}\n`, 'utf8');
  return lines;
}

export function addNotes(dataDir, key, notes) {
  const current = readMemory(dataDir, key);
  const fresh = cleanNotes(notes, Infinity).filter(n => !current.includes(n));
  return writeMemory(dataDir, key, [...current, ...fresh]);
}

// The memory section the room owns inside a repo's AGENTS.md; a later PR replaces it instead of adding another.
const START = '<!-- agent-room-memory:start -->';
const END = '<!-- agent-room-memory:end -->';

export function withMemorySection(current, notes) {
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const section = [START, '## Project memory (Agent Room)', '',
    'Notes the owner approved after Agent Room sessions. Each one should change how an agent works in this repo.', '',
    ...notes.map(n => `- ${n}`), END].join(eol);
  const start = current.indexOf(START);
  const end = current.indexOf(END, start);
  if (start >= 0 && end >= 0) return `${current.slice(0, start)}${section}${current.slice(end + END.length)}`;
  if (!current.trim()) return `# Agent instructions${eol}${eol}${section}${eol}`;
  return `${current.replace(/\s*$/, '')}${eol}${eol}${section}${eol}`;
}

// Offers the repo's project memory as a pull request that edits its committed AGENTS.md, on a branch cut from the
// checkout's current HEAD in a worktree of its own; the owner's checkout is never touched.
export function memoryPullRequest(dataDir, repoDir, { buildsRoot, gh }) {
  const notes = readMemory(dataDir, basename(repoDir));
  if (!notes.length) throw roomError('MEMORY_EMPTY', 'There are no notes to offer.');
  const stamp = Date.now();
  const branch = `room/memory-${stamp}`;
  const dir = join(buildsRoot, 'worktrees', `${basename(repoDir)}-memory-${stamp}`);
  const { baseBranch } = createWorktree(repoDir, dir, branch);
  try {
    const file = join(dir, 'AGENTS.md');
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    writeFileSync(file, withMemorySection(current, notes), 'utf8');
    if (!commitAll(dir, 'docs: project memory from the Agent Room')) throw roomError('MEMORY_UNCHANGED', 'AGENTS.md already holds these notes.');
    const body = `Project memory the owner approved after Agent Room sessions, added to AGENTS.md:\n\n${notes.map(n => `- ${n}`).join('\n')}\n`;
    const url = openPullRequest(repoDir, branch, baseBranch, { title: 'docs: project memory from the Agent Room', body, gh });
    finishWorktree(repoDir, dir, branch, null, 'keep');
    return { url, branch, baseBranch, created: !current, notes: notes.length };
  } catch (error) {
    finishWorktree(repoDir, dir, branch, null, 'reject');
    throw error;
  }
}
