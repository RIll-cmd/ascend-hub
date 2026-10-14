import { AGENT_NAMES, type AgentId, type AgentQuota, type QuotaWindow } from "./room-types";

// Subscription limits as bars: how much of each window is used, when it resets, and how old the reading is.
export type LimitTone = "ok" | "warn" | "full" | "unknown";
export type LimitBar = { label: "5-hour" | "Weekly"; percent: number | null; tone: LimitTone; resets: string | null };
export type AgentLimits = { agent: AgentId; name: string; bars: LimitBar[]; seen: string | null; stale: boolean; note?: string };

const ORDER: AgentId[] = ["claude", "codex", "agy"];
// Readings only arrive with agent turns, so an hour-old one may be well off.
const STALE_MS = 60 * 60_000;

function span(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

function bar(label: LimitBar["label"], window: QuotaWindow, nowMs: number): LimitBar | null {
  if (!window || window.usedPercent === null) return null;
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : NaN;
  // The window rolled over after this reading, so the old percent no longer says anything.
  if (resetsAt <= nowMs) return { label, percent: null, tone: "unknown", resets: "reset since this reading" };
  const percent = Math.min(100, Math.max(0, window.usedPercent));
  const tone = percent >= 90 ? "full" : percent >= 70 ? "warn" : "ok";
  return { label, percent, tone, resets: Number.isNaN(resetsAt) ? null : `resets in ${span(resetsAt - nowMs)}` };
}

export function limitsView(quota: Partial<Record<AgentId, AgentQuota>> | undefined, nowMs: number): AgentLimits[] {
  return ORDER.map(agent => {
    const name = AGENT_NAMES[agent];
    const q = quota?.[agent];
    if (!q) {
      const note = agent === "agy" ? "Antigravity's CLI does not report its limits." : "No reading yet. Refresh to check.";
      return { agent, name, bars: [], seen: null, stale: false, note };
    }
    const bars = [bar("5-hour", q.fiveHour, nowMs), bar("Weekly", q.weekly, nowMs)].filter((b): b is LimitBar => b !== null);
    const age = q.seenAt ? nowMs - Date.parse(q.seenAt) : NaN;
    const seen = Number.isNaN(age) ? null : age < 60_000 ? "read just now" : `read ${span(age)} ago`;
    return { agent, name, bars, seen, stale: age > STALE_MS };
  });
}

// The fullest window across agents, for a one-line summary.
export function limitsSummary(view: AgentLimits[]): { text: string; tone: LimitTone } | null {
  let top: { name: string; bar: LimitBar } | null = null;
  for (const agent of view) {
    for (const b of agent.bars) if (b.percent !== null && (!top || b.percent > top.bar.percent!)) top = { name: agent.name, bar: b };
  }
  return top ? { text: `${top.name} ${top.bar.label.toLowerCase()} ${top.bar.percent}%`, tone: top.bar.tone } : null;
}
