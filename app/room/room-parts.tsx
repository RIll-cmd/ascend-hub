"use client";
import { useEffect, useRef, useState } from "react";
import {
  AGENT_IDS, AGENT_NAMES, DEFAULT_ROLES, rolesOf,
  type AgentId, type Availability, type Message, type PlanTask, type Roles, type SessionMode, type SessionView, type Stage,
} from "./room-types";

export type Act = (path: string, body?: unknown) => Promise<void>;

const GATE = "/api/room/sessions/current/gate";
const RESUME = "/api/room/sessions/current/resume";

const STEPS: { label: string; stages: Stage[] }[] = [
  { label: "Discuss", stages: ["discuss", "roles"] },
  { label: "Roles", stages: ["gate-roles"] },
  { label: "Plan", stages: ["plan", "gate-plan"] },
  { label: "Build", stages: ["build"] },
  { label: "Finish", stages: ["finish", "gate-result"] },
  { label: "Done", stages: ["done", "rejected", "stopped"] },
];

const DEBATE_STEPS: { label: string; stages: Stage[] }[] = [
  { label: "Opening", stages: ["opening"] },
  { label: "Critique", stages: ["critique"] },
  { label: "Verdict", stages: ["verdict"] },
  { label: "Done", stages: ["done", "stopped"] },
];

export function Crt({ id, availability, session }: { id: AgentId; availability?: Availability; session: SessionView | null }) {
  const active = session?.active ?? null;
  const busy = active?.agent === id;
  const status = availability?.state === "offline" ? "offline · not signed in"
    : availability?.state !== "ready" ? "checking…"
      : busy && active ? `${active.activity}…` : "idle";
  const badges = session?.mode === "debate" ? (session.judge === id ? ["judge"] : []) : rolesOf(id, session?.roles ?? null);
  return (
    <div className={`agent-room-crt agent-room-${id}${busy ? " is-busy" : ""}`}>
      <b>{AGENT_NAMES[id]}</b>
      <span className="agent-room-badges">
        {badges.map(role => <span key={role} className="agent-room-badge">{role}</span>)}
      </span>
      <span className="agent-room-crt-status" aria-live="polite" title={availability?.detail}>{status}</span>
    </div>
  );
}

export function StageSteps({ stage, paused, mode = "build" }: { stage: Stage; paused: boolean; mode?: SessionMode }) {
  return (
    <ol className="agent-room-steps" aria-label="Session stage">
      {(mode === "debate" ? DEBATE_STEPS : STEPS).map(step => {
        const current = step.stages.includes(stage);
        const label = current && step.label === "Done" ? stage : step.label;
        return (
          <li key={step.label} className={current ? "is-current" : undefined} aria-current={current ? "step" : undefined}>
            {label}{current && paused ? " · paused" : ""}
          </li>
        );
      })}
    </ol>
  );
}

export function Transcript({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);
  return (
    <div ref={ref} className="agent-room-log" role="log" aria-label="Transcript">
      {messages.map((m, i) => (
        <p key={`${m.at}-${i}`} className={m.from === "room" ? "is-room" : undefined}>
          <b className={m.from === "room" ? undefined : `agent-room-name-${m.from}`}>{m.from === "room" ? "ROOM" : AGENT_NAMES[m.from]}:</b> {m.text}
        </p>
      ))}
    </div>
  );
}

export function TaskBoard({ tasks }: { tasks: PlanTask[] }) {
  return (
    <aside className="agent-room-board" aria-label="Plan tasks">
      <h2>Plan</h2>
      <ol>
        {tasks.map(t => (
          <li key={t.id} className={`is-${t.status}`}>
            <span>{t.id}. {t.title}</span>
            <small>{AGENT_NAMES[t.assignee]} · {t.status}{t.attempts ? ` · retry ${t.attempts}` : ""}{t.commit ? ` · ${t.commit}` : ""}</small>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function AgentSelect({ value, options, label, onChange }: { value: AgentId; options: AgentId[]; label: string; onChange: (id: AgentId) => void }) {
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value as AgentId)}>
      {options.map(id => <option key={id} value={id}>{AGENT_NAMES[id]}</option>)}
    </select>
  );
}

export function RolesEditor({ value, onChange }: { value: Roles; onChange: (roles: Roles) => void }) {
  const toggleCoder = (id: AgentId) =>
    onChange({ ...value, coders: value.coders.includes(id) ? value.coders.filter(c => c !== id) : [...value.coders, id] });
  return (
    <fieldset className="agent-room-roles">
      <legend>Roles</legend>
      <label>Orchestrator <AgentSelect label="Orchestrator" value={value.orchestrator} options={AGENT_IDS} onChange={orchestrator => onChange({ ...value, orchestrator })} /></label>
      <span>Coders {AGENT_IDS.map(id => (
        <label key={id}><input type="checkbox" checked={value.coders.includes(id)} onChange={() => toggleCoder(id)} /> {AGENT_NAMES[id]}</label>
      ))}</span>
      <label>Reviewer{" "}
        <select aria-label="Reviewer" value={value.reviewer ?? ""} onChange={e => onChange({ ...value, reviewer: (e.target.value || null) as AgentId | null })}>
          <option value="">None</option>
          {AGENT_IDS.map(id => <option key={id} value={id}>{AGENT_NAMES[id]}</option>)}
        </select>
      </label>
    </fieldset>
  );
}

export function BriefForm({ agents, folders = [], act }: { agents?: Record<AgentId, Availability>; folders?: string[]; act: Act }) {
  const [kind, setKind] = useState<SessionMode>("build");
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [ownRoles, setOwnRoles] = useState(false);
  const [roles, setRoles] = useState<Roles>(DEFAULT_ROLES);
  const [question, setQuestion] = useState("");
  const [folder, setFolder] = useState("");
  const [judge, setJudge] = useState<AgentId>("codex");
  const missing = AGENT_IDS.filter(id => agents?.[id]?.state !== "ready");
  const chosenFolder = folders.includes(folder) ? folder : folders[0] ?? "";
  const body = kind === "debate"
    ? { mode: "debate", question, folder: chosenFolder, judge }
    : { project, task, ...(ownRoles ? { roles } : {}) };
  return (
    <form className="agent-room-brief" onSubmit={e => { e.preventDefault(); void act("/api/room/sessions", body); }}>
      <div className="agent-room-kind" role="radiogroup" aria-label="Session type">
        <label><input type="radio" name="room-kind" checked={kind === "build"} onChange={() => setKind("build")} /> Build a project</label>
        <label><input type="radio" name="room-kind" checked={kind === "debate"} onChange={() => setKind("debate")} /> Debate a question</label>
      </div>
      {kind === "build" ? (
        <>
          <label>Project name
            <input value={project} onChange={e => setProject(e.target.value)} pattern="[a-z0-9][a-z0-9\-]{0,39}" required placeholder="todo-system" />
          </label>
          <small>Built in D:\ascend-builds\{project || "<name>"} as its own git repository.</small>
          <label>What should they build?
            <textarea value={task} onChange={e => setTask(e.target.value)} maxLength={4000} required rows={4} />
          </label>
          <label><input type="checkbox" checked={ownRoles} onChange={e => setOwnRoles(e.target.checked)} /> Set roles myself (skip the discussion)</label>
          {ownRoles && <RolesEditor value={roles} onChange={setRoles} />}
        </>
      ) : (
        <>
          <label>What should they debate?
            <textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={4000} required rows={4} />
          </label>
          <label>Folder they may read
            <select value={chosenFolder} onChange={e => setFolder(e.target.value)} required>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label>Judge <AgentSelect label="Judge" value={judge} options={AGENT_IDS} onChange={setJudge} /></label>
          <small>Each agent answers alone, then critiques the others; the judge writes the combined answer. Read-only: nothing in the folder changes.</small>
        </>
      )}
      <button type="submit" disabled={missing.length > 0 || (kind === "debate" && !chosenFolder)}>Start</button>
      {missing.length > 0 && <p className="agent-room-hint">Waiting for: {missing.map(id => AGENT_NAMES[id]).join(", ")}</p>}
    </form>
  );
}

export function VerdictPanel({ session }: { session: SessionView }) {
  if (session.mode !== "debate" || !session.answer) return null;
  const answer = session.answer;
  const download = () => {
    const url = URL.createObjectURL(new Blob([`# Debate\n\n**Question:** ${session.task}\n\n${answer}\n`], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `debate-${session.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="agent-room-verdict" aria-label="Verdict">
      <h2>Verdict</h2>
      <div className="agent-room-verdict-text">{answer}</div>
      <button onClick={download}>Download .md</button>
    </section>
  );
}

function RolesGate({ initial, act }: { initial: Roles; act: Act }) {
  const [roles, setRoles] = useState(initial);
  return (
    <div className="agent-room-gate">
      <p>The agents proposed these roles. Edit them or approve.</p>
      <RolesEditor value={roles} onChange={setRoles} />
      <button onClick={() => act(GATE, { gate: "roles", decision: "approve", roles })}>Approve roles</button>
    </div>
  );
}

function PlanGate({ tasks, coders, act }: { tasks: PlanTask[]; coders: AgentId[]; act: Act }) {
  const [draft, setDraft] = useState(tasks.map(t => ({ title: t.title, assignee: t.assignee, description: t.description })));
  const update = (index: number, patch: Partial<(typeof draft)[number]>) => setDraft(d => d.map((t, j) => (j === index ? { ...t, ...patch } : t)));
  return (
    <div className="agent-room-gate">
      <p>Review the plan. You can change titles and assignees.</p>
      <ol className="agent-room-plan-edit">
        {draft.map((t, i) => (
          <li key={i}>
            <input aria-label={`Task ${i + 1} title`} value={t.title} maxLength={120} onChange={e => update(i, { title: e.target.value })} />
            <AgentSelect label={`Task ${i + 1} assignee`} value={t.assignee} options={coders} onChange={assignee => update(i, { assignee })} />
            <p>{t.description}</p>
          </li>
        ))}
      </ol>
      <button onClick={() => act(GATE, { gate: "plan", decision: "approve", plan: { tasks: draft } })}>Approve plan</button>
    </div>
  );
}

function PausePanel({ session, act }: { session: SessionView; act: Act }) {
  const coders = session.roles?.coders ?? [];
  const [agent, setAgent] = useState<AgentId>(coders[0] ?? "claude");
  return (
    <div className="agent-room-gate" role="alert">
      <p>Paused: {session.pause?.reason}</p>
      <button onClick={() => act(RESUME, { action: "retry" })}>Retry</button>
      {session.stage === "build" && coders.length > 0 && (
        <>
          <AgentSelect label="Reassign to" value={agent} options={coders} onChange={setAgent} />
          <button onClick={() => act(RESUME, { action: "reassign", agent })}>Reassign</button>
        </>
      )}
      <button onClick={() => act(RESUME, { action: "stop" })}>Stop</button>
    </div>
  );
}

export function GateBar({ session, act }: { session: SessionView; act: Act }) {
  if (session.pause) return <PausePanel session={session} act={act} />;
  if (session.stage === "gate-roles" && session.roles) return <RolesGate key={session.id} initial={session.roles} act={act} />;
  if (session.stage === "gate-plan" && session.plan) return <PlanGate key={session.id} tasks={session.plan.tasks} coders={session.roles?.coders ?? []} act={act} />;
  if (session.stage === "gate-result") {
    return (
      <div className="agent-room-gate">
        <p>Work finished in <code>{session.projectDir}</code>. See SUMMARY.md there.</p>
        <button onClick={() => act(GATE, { gate: "result", decision: "accept" })}>Accept</button>
        <button onClick={() => act(GATE, { gate: "result", decision: "reject" })}>Reject</button>
      </div>
    );
  }
  return null;
}
