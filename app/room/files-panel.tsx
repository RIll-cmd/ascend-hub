"use client";
import { useEffect, useMemo, useState } from "react";
import { fileTree, formatBytes, type FileNode } from "./files-view";

type Listing = { dir: string; files: string[]; more: number };
type Opened = { path: string; size: number; text?: string; binary?: boolean; tooLarge?: boolean; error?: string };

async function getJson<T>(url: string): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json() as T & { error?: string; message?: string };
    return res.ok ? { data } : { error: data.message ?? data.error ?? `Request failed (${res.status})` };
  } catch {
    return { error: "Hub could not be reached." };
  }
}

function Tree({ nodes, open, onOpen, depth = 0 }: { nodes: FileNode[]; open: string | null; onOpen: (path: string) => void; depth?: number }) {
  return (
    <ul className="agent-room-file-tree">
      {nodes.map(n => (
        <li key={n.path}>
          {n.children ? (
            <details open={depth === 0}>
              <summary>{n.name}/</summary>
              <Tree nodes={n.children} open={open} onOpen={onOpen} depth={depth + 1} />
            </details>
          ) : (
            <button type="button" aria-current={n.path === open ? "true" : undefined} onClick={() => onOpen(n.path)}>{n.name}</button>
          )}
        </li>
      ))}
    </ul>
  );
}

// The files of a build session's folder as a tree, and the chosen one read-only. Ignored files (.env, node_modules) never show.
export function FilesPanel({ sessionId, stage }: { sessionId: string; stage: string }) {
  const [listing, setListing] = useState<{ id: string; data?: Listing; error?: string } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    void getJson<Listing>(`/api/room/sessions/${sessionId}/files`).then(r => { if (alive) setListing({ id: sessionId, ...r }); });
    return () => { alive = false; };
  }, [sessionId, stage, refresh]);
  const current = listing?.id === sessionId ? listing : null;
  const tree = useMemo(() => fileTree(current?.data?.files ?? []), [current]);
  const open = async (path: string) => {
    setOpened({ path, size: 0 });
    const r = await getJson<Opened>(`/api/room/sessions/${sessionId}/file?path=${encodeURIComponent(path)}`);
    setOpened(r.data ?? { path, size: 0, error: r.error });
  };
  if (!current) return <div className="agent-room-workflow"><p>Reading the files…</p></div>;
  if (current.error) return <div className="agent-room-workflow"><p role="alert" className="agent-room-error">{current.error}</p></div>;
  const shown = opened && current.data!.files.includes(opened.path) ? opened : null;
  return (
    <div className="agent-room-files">
      <nav aria-label="Files">
        <p className="agent-room-files-head">
          <span title={current.data!.dir}>{current.data!.files.length} files{current.data!.more ? ` (+${current.data!.more} more)` : ""}</span>
          <button type="button" className="agent-room-link" onClick={() => setRefresh(n => n + 1)}>Refresh</button>
        </p>
        {tree.length ? <Tree nodes={tree} open={shown?.path ?? null} onOpen={path => void open(path)} /> : <p>No files yet.</p>}
      </nav>
      <section className="agent-room-terminal" aria-label={shown ? `File ${shown.path}` : "File viewer"}>
        <header><code>{shown?.path ?? "Pick a file"}</code>{shown && !shown.error && shown.size > 0 && <span>{formatBytes(shown.size)}</span>}</header>
        <pre tabIndex={0}>{!shown ? "Pick a file on the left to read it. Nothing here can be edited."
          : shown.error ?? (shown.binary ? "Binary file: not shown." : shown.tooLarge ? "Larger than 512 KB: not shown." : shown.text === undefined ? "Loading…" : shown.text || "(empty file)")}</pre>
      </section>
    </div>
  );
}
