"use client";
import { useEffect, useState } from "react";
import { DiffText } from "./workflow-panel";
import { AGENT_NAMES, type AgentId } from "./room-types";

type LiveDiff = {
  at: string; agent: AgentId | null; activity: string | null; elsewhere: boolean;
  task: { id: number; title: string; assignee: AgentId } | null; files: number; text: string;
};

// The session folder's uncommitted changes, refreshed every 3 seconds while the tab is open.
export function LiveDiffPanel({ sessionId }: { sessionId: string }) {
  const [diff, setDiff] = useState<{ id: string; data?: LiveDiff; error?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/room/sessions/current/live-diff", { cache: "no-store" })
      .then(async r => ({ ok: r.ok, data: await r.json() as LiveDiff & { error?: string } }))
      .then(({ ok, data }) => { if (alive) setDiff(ok ? { id: sessionId, data } : { id: sessionId, error: data.error ?? "The changes could not be read." }); },
        () => { if (alive) setDiff({ id: sessionId, error: "Hub could not be reached." }); });
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 3_000);
    return () => { alive = false; clearTimeout(first); clearInterval(timer); };
  }, [sessionId]);
  const current = diff?.id === sessionId ? diff : null;
  if (!current) return <div className="agent-room-workflow"><p>Reading the changes…</p></div>;
  if (current.error) return <div className="agent-room-workflow"><p role="alert" className="agent-room-error">{current.error}</p></div>;
  const d = current.data!;
  const who = d.agent ? `${AGENT_NAMES[d.agent]} ${d.activity ?? "working"}` : "No agent working";
  return (
    <div className="agent-room-workflow agent-room-live-diff">
      <p className="agent-room-live-diff-head" aria-live="polite">
        <b>{d.task ? `Task ${d.task.id}: ${d.task.title}` : "Between tasks"}</b>
        <span>{who} · {d.files === 0 ? "no uncommitted changes" : `${d.files} file${d.files === 1 ? "" : "s"} changed`} · updated {new Date(d.at).toLocaleTimeString()}</span>
      </p>
      {d.elsewhere && <p>Parallel and race attempts edit in their own worktrees, so their changes show in Workflow once committed.</p>}
      {d.text ? <DiffText text={d.text} label="Uncommitted changes" />
        : <p>Nothing uncommitted. A coder&apos;s edits show here while a task is being built; each finished task&apos;s diff is in Workflow.</p>}
    </div>
  );
}
