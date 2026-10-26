import { join } from 'node:path';
import { readJson, writeJsonAtomic } from './store.mjs';

// How much each skill earns its place: sessions it was offered in, sessions an agent read it in, and offers since the
// last read. A skill offered STALE_AFTER sessions in a row without a read is stale, a hint to switch it off or remove it.
export const STALE_AFTER = 5;
const file = dataDir => join(dataDir, 'skill-usage.json');

export function readUsage(dataDir) {
  return readJson(file(dataDir), {}) ?? {};
}

const entry = (usage, id) => (usage[id] ??= { offered: 0, read: 0, sinceRead: 0, lastRead: null });

// A session started with these skills copied in; counted once per session.
export function recordOffers(dataDir, ids) {
  if (!ids.length) return;
  const usage = readUsage(dataDir);
  for (const id of ids) {
    const e = entry(usage, id);
    e.offered += 1;
    e.sinceRead += 1;
  }
  writeJsonAtomic(file(dataDir), usage);
}

// An agent opened this skill for the first time in a session.
export function recordRead(dataDir, id, at = new Date().toISOString()) {
  const usage = readUsage(dataDir);
  const e = entry(usage, id);
  e.read += 1;
  e.sinceRead = 0;
  e.lastRead = at;
  writeJsonAtomic(file(dataDir), usage);
}

export const usageOf = (usage, id) => {
  const e = usage[id] ?? { offered: 0, read: 0, sinceRead: 0, lastRead: null };
  return { ...e, stale: e.sinceRead >= STALE_AFTER };
};
