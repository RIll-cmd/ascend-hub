import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonLine } from './events.mjs';

// Subscription windows: a rolling 5-hour window and a weekly cap. Values are percent used and reset time.
const NEAR_FULL = 90;
const iso = seconds => (typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null);
const pct = value => (typeof value === 'number' ? Math.round(value) : null);

export function claudeQuota(event) {
  const windows = event?.type === 'rate_limit_event' ? event.rate_limit_info?.unifiedWindows : null;
  if (!windows) return null;
  const read = w => (w ? { usedPercent: pct(w.utilization * 100), resetsAt: iso(w.resetsAt) } : null);
  return { fiveHour: read(windows.five_hour), weekly: read(windows.seven_day) };
}

// Codex's exec stream has no rate limits, but its session log does. Only the rate_limits field is read.
export function codexQuotaFromLog(text) {
  const lines = String(text).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"rate_limits"')) continue;
    const limits = parseJsonLine(lines[i])?.payload?.rate_limits;
    if (!limits?.primary) continue;
    const read = w => (w ? { usedPercent: pct(w.used_percent), resetsAt: iso(w.resets_at) } : null);
    return { fiveHour: read(limits.primary), weekly: read(limits.secondary) };
  }
  return null;
}

// The newest few session logs, newest first: a turn still running has not written its rate limits yet.
function recentLogs(home, max = 5) {
  const root = join(home, 'sessions');
  if (!existsSync(root)) return [];
  const days = [];
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir).filter(n => /^\d+$/.test(n)).sort().reverse()) {
      if (days.length >= 3) return;
      const path = join(dir, name);
      if (depth === 0) days.push(path);
      else walk(path, depth - 1);
    }
  };
  walk(root, 2);
  return days.flatMap(day => readdirSync(day).filter(n => n.startsWith('rollout-') && n.endsWith('.jsonl'))
    .map(n => ({ path: join(day, n), mtime: statSync(join(day, n)).mtimeMs })))
    .sort((a, b) => b.mtime - a.mtime).slice(0, max).map(f => f.path);
}

function readTail(file, bytes = 256 * 1024) {
  const size = statSync(file).size;
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try { readSync(fd, buffer, 0, length, size - length); } finally { closeSync(fd); }
  return buffer.toString('utf8');
}

export function latestCodexQuota(home) {
  try {
    for (const file of recentLogs(home)) {
      const quota = codexQuotaFromLog(readTail(file));
      if (quota) return quota;
    }
    return null;
  } catch {
    return null;
  }
}

const RETRY_FALLBACK_MS = 10 * 60_000;

// When a rate-limited agent may try again: a reset time in the error ("...limit reached|1792000000"), else the reset of
// its nearly full window, else in ten minutes. Never in the past.
export function retryTime(errorText, quota, now = Date.now()) {
  const epoch = /\|(\d{10})\b/.exec(String(errorText ?? ''));
  const resets = [
    ...(epoch ? [Number(epoch[1]) * 1000] : []),
    ...[quota?.fiveHour, quota?.weekly].filter(w => w?.usedPercent >= 95 && w.resetsAt).map(w => Date.parse(w.resetsAt)),
  ].filter(t => t > now);
  return new Date(resets.length ? Math.min(...resets) + 60_000 : now + RETRY_FALLBACK_MS).toISOString();
}

const NAMES = { codex: 'Codex', claude: 'Claude', agy: 'Antigravity' };

export function quotaWarning(quota = {}) {
  for (const [agent, q] of Object.entries(quota)) {
    for (const [key, label] of [['fiveHour', '5-hour'], ['weekly', 'weekly']]) {
      const w = q?.[key];
      if (w?.usedPercent >= NEAR_FULL) {
        const resets = w.resetsAt ? ` (resets ${new Date(w.resetsAt).toLocaleString([], { weekday: key === 'weekly' ? 'short' : undefined, hour: '2-digit', minute: '2-digit' })})` : '';
        return `${NAMES[agent] ?? agent} has used ${w.usedPercent}% of its ${label} window${resets}. Consider giving it fewer roles.`;
      }
    }
  }
  return null;
}
