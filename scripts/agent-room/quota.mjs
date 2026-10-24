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

// The next time the local clock reads "resets 4pm" / "resets 11:40pm" after now.
// shortcut: assumes the CLI prints this machine's time zone (it names it, e.g. "(Asia/Shanghai)"); parse the zone if that ever differs.
function nextClockTime(text, now) {
  const m = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(text);
  if (!m) return null;
  const at = new Date(now);
  at.setHours((Number(m[1]) % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0), Number(m[2] ?? 0), 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

// When a rate-limited agent may try again, a minute after: the epoch in the error ("...limit reached|1792000000"); else the
// latest reset of its full windows (all of them must clear); else the clock time in the error; else in ten minutes.
export function retryTime(errorText, quota, now = Date.now()) {
  const text = String(errorText ?? '');
  const future = t => (t > now ? t : null);
  const epoch = /\|(\d{10})\b/.exec(text);
  const full = [quota?.fiveHour, quota?.weekly].filter(w => w?.usedPercent >= 95 && w.resetsAt).map(w => Date.parse(w.resetsAt)).filter(t => t > now);
  const at = (epoch && future(Number(epoch[1]) * 1000)) ?? (full.length ? Math.max(...full) : null) ?? nextClockTime(text, now);
  return new Date(at ? at + 60_000 : now + RETRY_FALLBACK_MS).toISOString();
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
