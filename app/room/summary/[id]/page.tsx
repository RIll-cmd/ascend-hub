"use client";
import { useEffect, useState } from "react";
import { Markdown } from "../../markdown";

type Digest = { title: string; facts: [string, string][]; taskHeading: string; task: string; plan: string[]; summary: string | null; verdict: string | null };

// A session's outcome on one read-only page: facts, task, plan, summary or verdict, without the conversation.
// Print it (or save it as PDF) to share it; Hub itself only answers on this computer.
export default function SessionSummaryPage() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
    fetch(`/api/room/sessions/${encodeURIComponent(id)}/summary`, { cache: "no-store" })
      .then(async res => {
        const data = await res.json() as { summary?: Digest; message?: string; error?: string };
        if (res.ok && data.summary) { setDigest(data.summary); document.title = `${data.summary.title} · Agent Room`; }
        else setError(data.error === "NO_SESSION" ? "No session with this id." : data.message ?? data.error ?? "The room could not be reached.");
      }, () => setError("Hub could not be reached."));
  }, []);
  if (error) return <main className="room-summary-page"><p role="alert">{error}</p></main>;
  if (!digest) return <main className="room-summary-page"><p>Loading…</p></main>;
  return (
    <main className="room-summary-page">
      <header>
        <p className="room-summary-kicker">Agent Room session</p>
        <h1>{digest.title}</h1>
        <button type="button" className="room-summary-print" onClick={() => window.print()}>Print or save as PDF</button>
      </header>
      <dl>{digest.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><Markdown text={v} /></dd></div>)}</dl>
      <section><h2>{digest.taskHeading}</h2><Markdown text={digest.task} /></section>
      {digest.plan.length > 0 && <section><h2>Plan</h2><ol>{digest.plan.map(line => <li key={line}><Markdown text={line.replace(/^\d+\.\s*/, "")} /></li>)}</ol></section>}
      {digest.summary && <section><h2>Summary</h2><Markdown text={digest.summary} foldCode={100_000} /></section>}
      {digest.verdict && <section><h2>Verdict</h2><Markdown text={digest.verdict} foldCode={100_000} /></section>}
      {!digest.summary && !digest.verdict && <p className="room-summary-note">This session has no summary or verdict yet.</p>}
    </main>
  );
}
