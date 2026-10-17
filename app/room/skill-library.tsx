"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/neo/badge";
import { Button } from "@/components/neo/button";
import { Input } from "@/components/neo/input";
import { Markdown } from "./markdown";

type Source = { url: string; commit: string; license: string | null; fetchedAt: string } | null;
type Skill = { id: string; name: string; description: string; hasScripts: boolean; source: Source };
type Staged = { token: string; id: string; name: string; description: string; url: string; commit: string; license: string | null; hasScripts: boolean; files: string[]; skillMd: string; diff: string | null; update: string | null };
type Missing = { id: string; name: string; source: string };

async function post<T>(action: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string; candidates?: string[] }> {
  const res = await fetch(`/api/room/skills/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({})) as T & { message?: string; error?: string; candidates?: string[] };
  return res.ok ? { ok: true, data } : { ok: false, message: String(data.message ?? data.error ?? `Request failed (${res.status})`), candidates: data.candidates };
}

// What a fetched skill holds, for the owner to read before Install: nothing is in the library until then.
function StagedCard({ staged, onDone }: { staged: Staged; onDone: (message: string) => void }) {
  const [id, setId] = useState(staged.id);
  const install = async () => {
    const r = await post("install", { token: staged.token, id });
    onDone(r.ok ? `Installed ${id}.` : r.message);
  };
  const discard = async () => {
    await post("discard", { token: staged.token });
    onDone("Discarded.");
  };
  return (
    <section className="agent-room-skill-staged" aria-label={`Fetched ${staged.name}`}>
      <h3>{staged.update ? `Update for ${staged.update}` : staged.name}</h3>
      <p>{staged.description}</p>
      <p className="agent-room-badges">
        <Badge variant="neutral">commit {staged.commit.slice(0, 7)}</Badge>
        <Badge variant="neutral">{staged.license ? `license ${staged.license}` : "no license found"}</Badge>
        <Badge variant="neutral">{staged.files.length} file{staged.files.length === 1 ? "" : "s"}</Badge>
        {staged.hasScripts && <Badge>has scripts</Badge>}
      </p>
      {staged.hasScripts && <p className="agent-room-hint is-problem">This skill includes scripts. Agents may run them; read them before installing.</p>}
      {!staged.license && <p className="agent-room-hint is-problem">No license was found. Check the repository before using it.</p>}
      {staged.diff !== null && (staged.diff ? <pre className="agent-room-skill-diff">{staged.diff}</pre> : <p className="agent-room-hint">No changes since the installed copy.</p>)}
      {staged.diff === null && <div className="agent-room-skill-md"><Markdown text={staged.skillMd} /></div>}
      <div className="agent-room-skill-actions">
        {!staged.update && <label>Install as <Input className="h-9 w-48" value={id} onChange={e => setId(e.target.value)} pattern="[a-z0-9][a-z0-9\-]{0,63}" spellCheck={false} /></label>}
        <Button size="sm" onClick={() => void install()}>{staged.update ? "Install update" : "Install"}</Button>
        <Button size="sm" variant="neutral" onClick={() => void discard()}>Discard</Button>
      </div>
    </section>
  );
}

export function SkillLibrary({ open, onClose, onChange, missing }: { open: boolean; onClose: () => void; onChange: () => void; missing: Missing[] }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [viewing, setViewing] = useState<{ id: string; text: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    fetch("/api/room/skills", { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<{ skills?: Skill[] }>) : null))
      .then(data => setSkills(data?.skills ?? []), () => setSkills([]));
  }, []);
  useEffect(() => {
    if (!open) return;
    load();
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, load]);
  if (!open) return null;

  // Fetching downloads the folder from GitHub into a staging area; the owner still has to press Install.
  const fetchSkill = async (link: string, update: string | null = null) => {
    setBusy(true);
    setStatus(update ? `Checking ${update} for updates…` : "Fetching from GitHub…");
    setCandidates([]);
    setStaged(null);
    const r = await post<{ staged: Staged }>("fetch", { url: link, ...(update ? { update } : {}) });
    setBusy(false);
    if (r.ok) { setStaged(r.data.staged); setStatus(""); return; }
    setStatus(r.message);
    setCandidates(r.candidates ?? []);
  };
  const finished = (message: string) => {
    setStaged(null);
    setStatus(message);
    load();
    onChange();
  };
  const remove = async (id: string) => {
    const r = await post("remove", { id });
    finished(r.ok ? `Removed ${id}.` : r.message);
  };
  const view = async (id: string) => {
    const res = await fetch(`/api/room/skills?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as { text?: string };
    setViewing(viewing?.id === id ? null : { id, text: data.text ?? "Could not read SKILL.md." });
  };

  return (
    <div className="agent-room-drawer" role="dialog" aria-modal="true" aria-label="Skill library" ref={panel}>
      <div className="agent-room-drawer-bar">
        <b>Skill library</b>
        <Button size="sm" variant="neutral" className="ml-auto" onClick={onClose}>Close</Button>
      </div>
      <div className="agent-room-skill-library">
        <form className="agent-room-skill-actions" onSubmit={e => { e.preventDefault(); if (url.trim()) void fetchSkill(url.trim()); }}>
          <label className="flex-1">Add from GitHub <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/tree/main/skills/name" spellCheck={false} /></label>
          <Button size="sm" type="submit" disabled={busy || !url.trim()}>Fetch</Button>
        </form>
        <p className="agent-room-hint">Fetch downloads the folder at its latest commit for you to read. Nothing is installed until you press Install.</p>
        {status && <p className="agent-room-hint" role="status">{status}</p>}
        {candidates.length > 0 && (
          <ul className="agent-room-skill-list">
            {candidates.map(c => <li key={c}><span>{c.split("/tree/")[1]?.split("/").slice(1).join("/") || c}</span><Button size="sm" variant="neutral" disabled={busy} onClick={() => { setUrl(c); void fetchSkill(c); }}>Fetch this one</Button></li>)}
          </ul>
        )}
        {staged && <StagedCard key={staged.token} staged={staged} onDone={finished} />}
        <h3>Installed</h3>
        {skills.length === 0 && <p className="agent-room-hint">No skills yet.</p>}
        <ul className="agent-room-skill-list">
          {skills.map(s => (
            <li key={s.id}>
              <span><b>{s.name}</b> <small>{s.id}{s.source ? ` · ${s.source.commit.slice(0, 7)} · ${s.source.license ?? "no license"}` : " · added by hand"}</small></span>
              {s.hasScripts && <Badge>has scripts</Badge>}
              <Button size="sm" variant="neutral" onClick={() => void view(s.id)}>{viewing?.id === s.id ? "Hide" : "View"}</Button>
              {s.source && <Button size="sm" variant="neutral" disabled={busy} onClick={() => void fetchSkill(s.source!.url, s.id)}>Update</Button>}
              <Button size="sm" variant="neutral" onClick={() => void remove(s.id)}>Remove</Button>
              {viewing?.id === s.id && <div className="agent-room-skill-md"><Markdown text={viewing.text} /></div>}
            </li>
          ))}
        </ul>
        {missing.length > 0 && (
          <>
            <h3>Named in your role sets, not installed</h3>
            <ul className="agent-room-skill-list">
              {missing.map(m => (
                <li key={m.id}>
                  <span><b>{m.name}</b> <small>{m.id}</small></span>
                  <a href={m.source} target="_blank" rel="noreferrer">source</a>
                  {m.source.startsWith("https://github.com/") && <Button size="sm" variant="neutral" disabled={busy} onClick={() => { setUrl(m.source); void fetchSkill(m.source); }}>Fetch</Button>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
