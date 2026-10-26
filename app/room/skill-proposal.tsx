"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/neo/button";
import { Input } from "@/components/neo/input";
import { Textarea } from "@/components/neo/textarea";

type Proposal = { name: string; description: string; body: string };
type Finding = { file: string; line: number; why: string; text: string };

// A skill the orchestrator proposed at the end of the session. The owner edits it, picks a role set, and saves it to the
// library; a safety-scan finding must be confirmed with a second Save.
export function SkillProposal({ proposal }: { proposal: Proposal }) {
  const [draft, setDraft] = useState(proposal);
  const [sets, setSets] = useState<{ id: string; name: string }[]>([]);
  const [set, setSet] = useState("general");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/room/role-sets", { cache: "no-store" }).then(r => r.json() as Promise<{ sets?: { id: string; name: string }[] }>)
      .then(data => setSets(data.sets ?? []), () => {});
  }, []);
  const save = async () => {
    const res = await fetch("/api/room/skills/save", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, set, confirm: findings.length > 0 }) }).catch(() => null);
    const data = res ? await res.json() as { saved?: { id: string }; findings?: Finding[]; message?: string } : null;
    if (res?.ok && data?.saved) { setStatus(`Saved as ${data.saved.id} and switched on in ${sets.find(s => s.id === set)?.name ?? set}.`); setFindings([]); return; }
    if (data?.findings?.length) { setFindings(data.findings); setStatus("Read the flagged lines, then save again to keep it anyway."); return; }
    setStatus(data?.message ?? "Hub could not be reached.");
  };
  const saved = status?.startsWith("Saved as");
  return (
    <details className="agent-room-skill-proposal">
      <summary>The agents propose a skill: {proposal.name}</summary>
      <label>Name <Input value={draft.name} maxLength={60} onChange={e => setDraft({ ...draft, name: e.target.value })} disabled={saved} /></label>
      <label>When to use it <Input value={draft.description} maxLength={300} onChange={e => setDraft({ ...draft, description: e.target.value })} disabled={saved} /></label>
      <label>Steps (Markdown)
        <Textarea value={draft.body} rows={8} maxLength={12_000} onChange={e => setDraft({ ...draft, body: e.target.value })} disabled={saved} />
      </label>
      <label>Add to role set
        <select value={set} onChange={e => setSet(e.target.value)} disabled={saved}>
          {(sets.length ? sets : [{ id: "general", name: "General" }]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {findings.length > 0 && (
        <ul className="agent-room-skill-scan" role="alert">{findings.map((f, i) => <li key={i}><code>line {f.line}</code> {f.why}: <q>{f.text}</q></li>)}</ul>
      )}
      <div className="agent-room-skill-proposal-bar">
        <Button size="sm" variant="neutral" disabled={saved} onClick={() => void save()}>{findings.length ? "Save anyway" : "Save as skill"}</Button>
        {status && <small role="status">{status}</small>}
      </div>
    </details>
  );
}
