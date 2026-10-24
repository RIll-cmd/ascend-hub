"use client";
import { useEffect, useState } from "react";
import { formatMs } from "./workflow-view";
import type { CheckRun, SessionView } from "./room-types";

const outcome = (run: CheckRun) => (run.ok ? "passed" : run.code === null ? "stopped" : `failed, exit ${run.code}`);

// Every check run of a session, newest last, with the chosen run's full output in a terminal pane.
// It follows the newest run until the owner picks one.
export function ChecksPanel({ session }: { session: SessionView }) {
  const runs = session.checkRuns ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const n = picked ?? runs.at(-1)?.n ?? null;
  const [shown, setShown] = useState<{ key: string; text?: string; error?: string } | null>(null);
  const key = `${session.id}/${n}`;
  useEffect(() => {
    if (n === null) return;
    let alive = true;
    fetch(`/api/room/sessions/${session.id}/checks/${n}`, { cache: "no-store" })
      .then(async r => ({ ok: r.ok, data: await r.json() as { output?: string; error?: string } }))
      .then(({ ok, data }) => { if (alive) setShown(ok ? { key, text: data.output ?? "" } : { key, error: data.error ?? "The output could not be read." }); },
        () => { if (alive) setShown({ key, error: "Hub could not be reached." }); });
    return () => { alive = false; };
  }, [session.id, n, key]);
  if (!runs.length) {
    return (
      <div className="agent-room-checks is-empty">
        <p>{session.check ? "No checks have run yet. They run after each task." : "This session has no check command. Add one under Options when you start a session."}</p>
      </div>
    );
  }
  const run = runs.find(r => r.n === n) ?? runs.at(-1)!;
  const output = shown?.key === key ? shown : null;
  return (
    <div className="agent-room-checks">
      <ol className="agent-room-check-runs" aria-label="Check runs">
        {runs.map(r => (
          <li key={r.n}>
            <button type="button" aria-current={r.n === run.n ? "true" : undefined} onClick={() => setPicked(r.n === runs.at(-1)?.n ? null : r.n)}>
              <span>#{r.n} {r.label}</span>
              <small className={r.ok ? "is-ok" : "is-bad"}>{outcome(r)} · {formatMs(r.ms)} · {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
            </button>
          </li>
        ))}
      </ol>
      <section className="agent-room-terminal" aria-label={`Output of check run ${run.n}`}>
        <header><code>$ {run.command}</code><span className={run.ok ? "is-ok" : "is-bad"}>{outcome(run)}</span></header>
        <pre tabIndex={0}>{output?.error ? output.error : output ? output.text || "(no output)" : "Loading…"}</pre>
      </section>
    </div>
  );
}
