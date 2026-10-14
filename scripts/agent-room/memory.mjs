import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { extractJsonBlock } from './parse.mjs';
import { roomError } from './paths.mjs';

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
