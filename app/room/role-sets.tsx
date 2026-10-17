"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/neo/badge";
import { Button } from "@/components/neo/button";
import { Checkbox } from "@/components/neo/checkbox";
import { SideSection } from "./room-parts";
import { SkillLibrary } from "./skill-library";

type RoleSkill = { id: string; name: string; source: string; on: boolean; installed: boolean; description: string; hasScripts: boolean };
type RoleSet = { id: string; name: string; prompt: string; on: boolean; always?: boolean; skills: RoleSkill[] };
type Change = { on?: boolean; skills?: Record<string, boolean> };

// Specialist roles (UI/UX, frontend, ...) and the skills each one brings; the switches are kept by the room.
export function RoleSets() {
  const [sets, setSets] = useState<RoleSet[] | null>(null);
  const [status, setStatus] = useState("");
  const [library, setLibrary] = useState(false);
  const load = useCallback(() => {
    fetch("/api/room/role-sets", { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<{ sets?: RoleSet[] }>) : null))
      .then(data => setSets(data?.sets ?? null), () => setSets(null));
  }, []);
  useEffect(load, [load]);
  const closeLibrary = useCallback(() => setLibrary(false), []);
  if (!sets) return null;
  const save = async (id: string, change: Change) => {
    const res = await fetch("/api/room/role-sets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sets: { [id]: change } }) });
    const data = await res.json().catch(() => ({})) as { sets?: RoleSet[] };
    if (res.ok && data.sets) setSets(data.sets);
    setStatus(res.ok ? "" : "Could not save the switch.");
  };
  const on = sets.filter(s => s.on);
  const missing = [...new Map(sets.flatMap(s => s.skills).filter(k => !k.installed).map(k => [k.id, { id: k.id, name: k.name, source: k.source }])).values()];
  return (
    <>
      <SideSection title="Role sets" value={on.length ? on.map(s => s.name).join(", ") : "Off"}>
        {sets.map(set => (
          <div key={set.id} className="agent-room-roleset">
            <label className="agent-room-check" title={set.prompt}>
              <Checkbox checked={set.on} onCheckedChange={checked => void save(set.id, { on: checked })} /> {set.name}
              {set.always && <Badge variant="neutral" title="Its skills go to every coder task, whatever the role.">every task</Badge>}
              <small>{set.skills.filter(k => k.installed).length} of {set.skills.length} skills installed</small>
            </label>
            {set.on && (
              <ul>
                {set.skills.map(k => (
                  <li key={k.id}>
                    <label className="agent-room-check" title={k.description || k.source}>
                      <Checkbox checked={k.on} onCheckedChange={checked => void save(set.id, { skills: { [k.id]: checked } })} aria-label={`${k.name} in ${set.name}`} />
                      <a href={k.source} target="_blank" rel="noreferrer">{k.name}</a>
                      {!k.installed && <Badge variant="neutral">not installed</Badge>}
                      {k.hasScripts && <Badge>has scripts</Badge>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <Button type="button" size="sm" variant="neutral" className="self-start" onClick={() => setLibrary(true)}>Skill library</Button>
        <p className="agent-room-hint">Add skills from GitHub in the library, or put folders in <code>.sites-runtime/agent-room/skills/&lt;id&gt;/</code>, each with a <code>SKILL.md</code>. A new session takes the sets that are on when it starts.</p>
        {status && <p className="agent-room-hint is-problem" role="status">{status}</p>}
      </SideSection>
      {/* Outside the accordion, so the fixed drawer is never clipped by it. */}
      <SkillLibrary open={library} onClose={closeLibrary} onChange={load} missing={missing} />
    </>
  );
}
