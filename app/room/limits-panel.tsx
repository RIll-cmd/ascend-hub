"use client";

import { Gauge, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNow } from "../status/use-now";
import { limitsSummary, limitsView, type AgentLimits } from "./limits-view";
import type { AgentId, AgentQuota } from "./room-types";

type Quota = Partial<Record<AgentId, AgentQuota>>;

// Polls the room's meter (free: it never runs an agent turn); refresh() may run one tiny Claude probe.
export function useLimits(pollMs: number | null = 60_000) {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (pollMs === null) return;
    const load = () => fetch("/api/room/quota", { cache: "no-store" })
      .then(res => (res.ok ? (res.json() as Promise<{ quota?: Quota }>) : null))
      .then(data => setQuota(data?.quota ?? null), () => setQuota(null));
    const first = setTimeout(load, 0);
    const timer = setInterval(load, pollMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [pollMs]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setMessage("Checking…");
    try {
      const res = await fetch("/api/room/quota", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { quota?: Quota; refreshed?: { claude: boolean } };
      if (!res.ok || !data.quota) throw new Error();
      setQuota(data.quota);
      setMessage(data.refreshed?.claude ? "Updated." : "Updated Codex. Claude was checked less than a minute ago, or a session is updating it.");
    } catch {
      setMessage("Could not refresh. Is the agent room running?");
    } finally {
      setRefreshing(false);
    }
  }, []);
  return { quota, refreshing, message, refresh };
}

function AgentBars({ limits }: { limits: AgentLimits }) {
  return (
    <span className="limits-agent">
      <span className="limits-agent-head">
        <b>{limits.name}</b>
        {limits.seen && <small className={limits.stale ? "limits-stale" : undefined} title={limits.stale ? "Readings arrive with agent turns; refresh for a new one." : undefined}>{limits.seen}</small>}
      </span>
      {limits.bars.map(bar => (
        <span key={bar.label} className="limits-bar" data-tone={bar.tone}>
          <span className="limits-bar-label">{bar.label}</span>
          <span className="limits-track" role="meter" aria-label={`${limits.name} ${bar.label.toLowerCase()} window used`} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={bar.percent ?? undefined} aria-valuetext={bar.percent === null ? bar.resets ?? "unknown" : `${bar.percent}%`}>
            <span className="limits-fill" style={{ width: `${bar.percent ?? 0}%` }} />
          </span>
          <span className="limits-pct">{bar.percent === null ? "?" : `${bar.percent}%`}</span>
          {bar.resets && <small className="limits-resets">{bar.resets}</small>}
        </span>
      ))}
      {limits.note && <small className="limits-note">{limits.note}</small>}
    </span>
  );
}

export function LimitsBars({ quota, agents, nowMs }: { quota: Quota | null | undefined; agents?: AgentId[]; nowMs?: number }) {
  const tick = useNow(30_000);
  const view = limitsView(quota ?? undefined, nowMs ?? tick).filter(a => !agents || agents.includes(a.agent));
  return <span className="limits-bars">{view.map(a => <AgentBars key={a.agent} limits={a} />)}</span>;
}

export function RefreshLimits({ refreshing, message, refresh }: Pick<ReturnType<typeof useLimits>, "refreshing" | "message" | "refresh">) {
  return (
    <span className="limits-refresh">
      <button type="button" onClick={() => void refresh()} disabled={refreshing} title="Re-reads Codex's log and runs one tiny Claude turn (at most once a minute).">
        <RefreshCw size={13} aria-hidden="true" className={refreshing ? "limits-spin" : undefined} /> {refreshing ? "Refreshing…" : "Refresh limits"}
      </button>
      <small aria-live="polite">{message}</small>
    </span>
  );
}

// Home screen: a small pill naming the fullest window; open it for every agent's bars.
export function HomeLimits() {
  const limits = useLimits();
  const [open, setOpen] = useState(false);
  const nowMs = useNow(open ? 15_000 : 60_000);
  if (!limits.quota) return null;
  const summary = limitsSummary(limitsView(limits.quota, nowMs));
  return (
    <aside className={`limits-home${open ? " is-open" : ""}`} aria-label="Agent subscription limits">
      {open ? (
        <div className="limits-home-panel">
          <header>
            <h2><Gauge size={15} aria-hidden="true" /> Limits</h2>
            <button type="button" className="limits-close" onClick={() => setOpen(false)} aria-label="Close limits"><X size={15} aria-hidden="true" /></button>
          </header>
          <LimitsBars quota={limits.quota} nowMs={nowMs} />
          <RefreshLimits {...limits} />
        </div>
      ) : (
        <button type="button" className="limits-pill" data-tone={summary?.tone ?? "unknown"} onClick={() => setOpen(true)} aria-expanded={false}>
          <Gauge size={14} aria-hidden="true" /> Limits{summary ? ` · ${summary.text}` : ""}
        </button>
      )}
    </aside>
  );
}
