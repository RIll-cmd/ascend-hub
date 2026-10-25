"use client";
import { useEffect, useState } from "react";
import { formatBytes } from "./files-view";

type Produced = { path: string; status: "added" | "changed" | "deleted"; size: number | null };

// The files this session's commits added, changed or deleted, each as a download as committed, plus one zip of them all.
export function ProducedFiles({ sessionId }: { sessionId: string }) {
  const [list, setList] = useState<{ id: string; files?: Produced[]; more?: number; error?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/room/sessions/${sessionId}/produced`, { cache: "no-store" })
      .then(async r => ({ ok: r.ok, data: await r.json() as { files?: Produced[]; more?: number; error?: string; message?: string } }))
      .then(({ ok, data }) => { if (alive) setList(ok ? { id: sessionId, files: data.files ?? [], more: data.more ?? 0 } : { id: sessionId, error: data.message ?? data.error }); },
        () => { if (alive) setList({ id: sessionId, error: "Hub could not be reached." }); });
    return () => { alive = false; };
  }, [sessionId]);
  const current = list?.id === sessionId ? list : null;
  if (!current) return null;
  if (current.error) return <p className="agent-room-hint is-problem">Files produced: {current.error}</p>;
  const files = current.files ?? [];
  const kept = files.filter(f => f.status !== "deleted");
  const base = `/api/room/sessions/${sessionId}/produced`;
  return (
    <details className="agent-room-produced">
      <summary>Files produced ({files.length}{current.more ? `+${current.more}` : ""})</summary>
      {files.length === 0 ? <p>No files were added or changed.</p> : (
        <>
          <ul>
            {files.map(f => (
              <li key={f.path}>
                <span className={`agent-room-produced-status is-${f.status}`}>{f.status}</span>
                {f.status === "deleted" ? <span>{f.path}</span>
                  : <a href={`${base}/file?path=${encodeURIComponent(f.path)}`} download>{f.path}</a>}
                {f.size !== null && <small>{formatBytes(f.size)}</small>}
              </li>
            ))}
          </ul>
          {kept.length > 1 && <a className="agent-room-link" href={`${base}/zip`} download>Download all {kept.length} as .zip</a>}
        </>
      )}
    </details>
  );
}
