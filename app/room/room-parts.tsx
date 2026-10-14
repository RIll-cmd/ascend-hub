"use client";
import { useEffect, useRef, useState } from "react";
import {
  AGENT_IDS, AGENT_NAMES, DEFAULT_ROLES,
  type AgentId, type Availability, type Message, type PlanTask, type Roles, type SessionMode, type SessionView, type Stage,
  type RepoChoice,
} from "./room-types";
import { messageLine, nearBottom, stepStates } from "./deck/deck-view";
import { DiffView } from "./workflow-panel";

export type Act = (path: string, body?: unknown) => Promise<void>;

const GATE = "/api/room/sessions/current/gate";
const RESUME = "/api/room/sessions/current/resume";

export function StageSteps({ stage, paused, mode = "build" }: { stage: Stage; paused: boolean; mode?: SessionMode }) {
  return (
    <ol className="agent-room-steps" aria-label="Session stage">
      {stepStates(stage, mode).map(step => (
        <li key={step.label} className={`is-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
          {step.label}{step.state === "current" && paused ? " · paused" : ""}
        </li>
      ))}
    </ol>
  );
}

export function Transcript({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    if (stick.current) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);
  return (
    <div ref={ref} className="agent-room-log" role="log" aria-label="Transcript"
      onScroll={event => { stick.current = nearBottom(event.currentTarget); }}>
      {messages.map((m, i) => {
        const line = messageLine(m);
        return (
          <p key={`${m.seq ?? m.at}-${i}`} className={m.from === "room" ? "is-room" : undefined}>
            <b className={m.from === "room" ? undefined : `agent-room-name-${m.from}`}>{line.from}</b>
            {line.to && <span className="agent-room-to"> → {line.to}</span>}: {m.text}
          </p>
        );
      })}
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

// The repo's project memory: what earlier sessions learned and the owner approved. Edit or prune it here.
function MemoryEditor({ dir }: { dir: string }) {
  const key = dir.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let alive = true;
    fetch(`/api/room/memory?key=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then(r => r.json() as Promise<{ notes?: string[] }>)
      .then(data => { if (alive) setText((data.notes ?? []).join("\n")); })
      .catch(() => { if (alive) setText(""); });
    return () => { alive = false; };
  }, [key]);
  const save = async () => {
    const res = await fetch("/api/room/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, notes: (text ?? "").split("\n") }) });
    setStatus(res.ok ? "Saved." : "Could not save.");
  };
  if (text === null) return null;
  return (
    <details className="agent-room-memory">
      <summary>Project memory for {key} ({text ? text.split("\n").filter(Boolean).length : 0} notes)</summary>
      <textarea value={text} rows={5} onChange={e => { setText(e.target.value); setStatus(""); }} aria-label={`Project memory for ${key}`} placeholder="One note per line. Agents read these at the start of every session in this repo." />
      <button type="button" onClick={() => void save()}>Save memory</button> <small>{status}</small>
    </details>
  );
}

export function BriefForm({ agents, folders = [], repos = [], quotaWarning, act }: {
  agents?: Record<AgentId, Availability>; folders?: string[]; repos?: RepoChoice[]; quotaWarning?: string | null; act: Act;
}) {
  const [kind, setKind] = useState<SessionMode>("build");
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [ownRoles, setOwnRoles] = useState(false);
  const [roles, setRoles] = useState<Roles>(DEFAULT_ROLES);
  const [question, setQuestion] = useState("");
  const [folder, setFolder] = useState("");
  const [judge, setJudge] = useState<AgentId>("codex");
  const [claudeSubagents, setClaudeSubagents] = useState(true);
  const [where, setWhere] = useState<"new" | "repo">("new");
  const [repoDir, setRepoDir] = useState("");
  const [check, setCheck] = useState<string | null>(null);
  const [limits, setLimits] = useState({ minutes: 120, turns: 80, rounds: 3 });
  const [template, setTemplate] = useState<"feature" | "bugfix" | "refactor" | "review">("feature");
  const [models, setModels] = useState<{ codex: string; claude: string }>({ codex: "", claude: "" });
  const missing = AGENT_IDS.filter(id => agents?.[id]?.state !== "ready");
  const chosenFolder = folders.includes(folder) ? folder : folders[0] ?? "";
  const inRepo = where === "repo" && repos.length > 0;
  const chosenRepo = repos.find(r => r.dir === repoDir) ?? repos[0];
  // The suggested command follows the chosen repo until the owner edits it.
  const checkCommand = check ?? (inRepo ? chosenRepo?.check ?? "" : "");
  const needsCheck = template === "bugfix" || template === "refactor";
  const chosenModels = Object.fromEntries(Object.entries(models).filter(([, m]) => m.trim()).map(([a, m]) => [a, m.trim()]));
  // "Review only" runs through the read-only debate flow on the chosen repo, so nothing in it can change.
  const reviewBody = { mode: "debate", question: `Code review only; do not change anything. Give prioritised findings with file and line references for: ${task}`, folder: chosenRepo?.dir ?? chosenFolder, judge: "codex", subagents: { claude: claudeSubagents } };
  const body = kind === "debate"
    ? { mode: "debate", question, folder: chosenFolder, judge, subagents: { claude: claudeSubagents } }
    : template === "review" ? reviewBody : { template, models: chosenModels, project, task, ...(ownRoles ? { roles } : {}), subagents: { claude: claudeSubagents }, ...(inRepo ? { repo: chosenRepo?.dir } : {}), ...(checkCommand.trim() ? { check: checkCommand.trim() } : {}), limits };
  return (
    <form className="agent-room-brief" onSubmit={e => { e.preventDefault(); void act("/api/room/sessions", body); }}>
      <div className="agent-room-kind" role="radiogroup" aria-label="Session type">
        <label><input type="radio" name="room-kind" checked={kind === "build"} onChange={() => setKind("build")} /> Build a project</label>
        <label><input type="radio" name="room-kind" checked={kind === "debate"} onChange={() => setKind("debate")} /> Debate a question</label>
      </div>
      {kind === "build" ? (
        <>
          <label>Kind of work
            <select value={template} onChange={e => setTemplate(e.target.value as typeof template)}>
              <option value="feature">Feature: discuss, plan, build</option>
              <option value="bugfix">Bug fix: reproduce with a failing test first</option>
              <option value="refactor">Refactor: behaviour must not change</option>
              <option value="review">Review only: findings, no edits</option>
            </select>
          </label>
          {needsCheck && <small>Needs a check command below: {template === "bugfix" ? "task 1 must make it fail, the fix must make it pass." : "it must pass before and after every task."}</small>}
          <div className="agent-room-kind" role="radiogroup" aria-label="Where">
            <label><input type="radio" name="room-where" checked={!inRepo} onChange={() => { setWhere("new"); setCheck(null); }} /> New project</label>
            <label><input type="radio" name="room-where" checked={inRepo} disabled={repos.length === 0} onChange={() => { setWhere("repo"); setCheck(null); }} /> Existing repo</label>
          </div>
          {inRepo && (
            <label>Repository
              <select value={chosenRepo?.dir ?? ""} onChange={e => { setRepoDir(e.target.value); setCheck(null); }}>
                {repos.map(r => <option key={r.dir} value={r.dir}>{r.dir}</option>)}
              </select>
            </label>
          )}
          <label>{inRepo ? "Branch name" : "Project name"}
            <input value={project} onChange={e => setProject(e.target.value)} pattern="[a-z0-9][a-z0-9\-]{0,39}" required placeholder={inRepo ? "fix-login" : "todo-system"} />
          </label>
          <small>{inRepo
            ? `Works on branch room/${project || "<name>"}-… in its own worktree. Your checkout of ${chosenRepo?.dir} is not touched until you merge.`
            : `Built in D:\\ascend-builds\\${project || "<name>"} as its own git repository.`}</small>
          {inRepo && chosenRepo && <MemoryEditor key={chosenRepo.dir} dir={chosenRepo.dir} />}
          <label>Checks after every task (optional)
            <input value={checkCommand} onChange={e => setCheck(e.target.value)} maxLength={500} placeholder="npm test" spellCheck={false} />
          </label>
          <small>Runs in the project folder after each task. A failing check sends the task back to the coder with the output.</small>
          <fieldset className="agent-room-limits">
            <legend>Models (empty uses each CLI&apos;s default)</legend>
            <label>Codex <input list="room-codex-models" value={models.codex} onChange={e => setModels(m => ({ ...m, codex: e.target.value }))} placeholder="gpt-6-astra" spellCheck={false} /></label>
            <label>Claude <input list="room-claude-models" value={models.claude} onChange={e => setModels(m => ({ ...m, claude: e.target.value }))} placeholder="default" spellCheck={false} /></label>
            <datalist id="room-codex-models"><option value="gpt-6-astra" /></datalist>
            <datalist id="room-claude-models"><option value="opus" /><option value="sonnet" /><option value="haiku" /></datalist>
          </fieldset>
          <fieldset className="agent-room-limits">
            <legend>Limits (the room pauses and asks you when one is reached)</legend>
            <label>Work minutes <input type="number" min={5} max={720} value={limits.minutes} onChange={e => setLimits(l => ({ ...l, minutes: Number(e.target.value) }))} /></label>
            <label>Agent turns <input type="number" min={1} max={500} value={limits.turns} onChange={e => setLimits(l => ({ ...l, turns: Number(e.target.value) }))} /></label>
            <label>Rounds per task <input type="number" min={1} max={10} value={limits.rounds} onChange={e => setLimits(l => ({ ...l, rounds: Number(e.target.value) }))} /></label>
          </fieldset>
          <label>What should they build?
            <textarea value={task} onChange={e => setTask(e.target.value)} maxLength={4000} required rows={4} />
          </label>
          <label className="agent-room-check"><input type="checkbox" checked={ownRoles} onChange={e => setOwnRoles(e.target.checked)} /> Set roles myself (skip the discussion)</label>
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
      <fieldset className="agent-room-subagents">
        <legend>Sub-agents</legend>
        <label className="agent-room-check"><input type="checkbox" checked={claudeSubagents} onChange={e => setClaudeSubagents(e.target.checked)} /> Claude may use sub-agents</label>
        <small>Codex: always on (it cannot be switched off). Antigravity: not supported yet.</small>
      </fieldset>
      {quotaWarning && <p className="agent-room-hint is-problem" role="status">{quotaWarning}</p>}
      <button type="submit" disabled={missing.length > 0 || (kind === "debate" && !chosenFolder) || (kind === "build" && needsCheck && !checkCommand.trim())}>Start</button>
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

// Notes the orchestrator proposes for project memory; only the ticked (and possibly edited) ones are kept.
function MemoryPicker({ proposal, onChange }: { proposal: string[]; onChange: (notes: string[]) => void }) {
  const [notes, setNotes] = useState(() => proposal.map(text => ({ text, keep: true })));
  const update = (next: { text: string; keep: boolean }[]) => { setNotes(next); onChange(next.filter(n => n.keep && n.text.trim()).map(n => n.text.trim())); };
  if (proposal.length === 0) return null;
  return (
    <fieldset className="agent-room-memory">
      <legend>Remember for next time (ticked notes are saved when you keep the result)</legend>
      {notes.map((note, i) => (
        <label key={i} className="agent-room-check">
          <input type="checkbox" checked={note.keep} onChange={e => update(notes.map((n, j) => (j === i ? { ...n, keep: e.target.checked } : n)))} />
          <input value={note.text} maxLength={200} onChange={e => update(notes.map((n, j) => (j === i ? { ...n, text: e.target.value } : n)))} aria-label={`Note ${i + 1}`} />
        </label>
      ))}
    </fieldset>
  );
}

// Sends the step back to the agents with the owner's note; a suggested option fills the note.
function ChangeRequest({ gate, options, act }: { gate: "roles" | "plan"; options: string[]; act: Act }) {
  const [note, setNote] = useState("");
  return (
    <div className="agent-room-gate agent-room-change">
      <p>Or ask the agents to change the {gate}:</p>
      {options.length > 0 && (
        <div className="agent-room-options">
          {options.map(option => <button key={option} type="button" onClick={() => setNote(option)}>{option}</button>)}
        </div>
      )}
      <textarea aria-label={`What should change in the ${gate}?`} value={note} maxLength={2000} rows={2} onChange={e => setNote(e.target.value)} placeholder="What should change?" />
      <button type="button" disabled={!note.trim()} onClick={() => act(GATE, { gate, decision: "revise", note: note.trim() })}>Request changes</button>
    </div>
  );
}

export function GateBar({ session, act }: { session: SessionView; act: Act }) {
  return <GateBarInner key={`${session.id}-${session.stage}`} session={session} act={act} />;
}

function GateBarInner({ session, act }: { session: SessionView; act: Act }) {
  // Seeded once per gate (GateBar keys this by stage), so polling cannot undo the owner's edits.
  const [proposal] = useState(() => session.attention?.memory ?? []);
  const [memory, setMemory] = useState(proposal);
  if (session.pause) return <PausePanel session={session} act={act} />;
  const options = session.attention?.options ?? [];
  // The same words Vision speaks, so the page and the voice assistant agree.
  const summary = session.attention?.summary ? <p className="agent-room-summary">{session.attention.summary}</p> : null;
  if (session.stage === "gate-roles" && session.roles) {
    return <>{summary}<RolesGate key={session.id} initial={session.roles} act={act} /><ChangeRequest key={`${session.id}-roles`} gate="roles" options={options} act={act} /></>;
  }
  if (session.stage === "gate-plan" && session.plan) {
    return <>{summary}<PlanGate key={session.id} tasks={session.plan.tasks} coders={session.roles?.coders ?? []} act={act} /><ChangeRequest key={`${session.id}-plan`} gate="plan" options={options} act={act} /></>;
  }
  if (session.stage === "gate-result" && session.repo) {
    const { branch, baseBranch, dir } = session.repo;
    return (
      <div className="agent-room-gate">
        {summary}
        <p>Branch <code>{branch}</code> of <code>{dir}</code>.</p>
        <DiffView commit="all" label="Show all changes on the branch" />
        <MemoryPicker proposal={proposal} onChange={setMemory} />
        <button onClick={() => act(GATE, { gate: "result", decision: "merge", memory })}>Merge into {baseBranch}</button>
        <button onClick={() => act(GATE, { gate: "result", decision: "accept", memory })}>Keep branch</button>
        <button onClick={() => act(GATE, { gate: "result", decision: "reject" })}>Reject and delete branch</button>
        <small>Merge only fast-forwards {baseBranch} while your checkout is on it; otherwise keep the branch and merge it yourself.</small>
      </div>
    );
  }
  if (session.stage === "gate-result") {
    return (
      <div className="agent-room-gate">
        {summary}
        <p>Work finished in <code>{session.projectDir}</code>. See SUMMARY.md there.</p>
        <DiffView commit="all" label="Show all changes" />
        <MemoryPicker proposal={proposal} onChange={setMemory} />
        <button onClick={() => act(GATE, { gate: "result", decision: "accept", memory })}>Accept</button>
        <button onClick={() => act(GATE, { gate: "result", decision: "reject" })}>Reject</button>
      </div>
    );
  }
  return null;
}
