"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
    <SideSection title="Plan" value={`${tasks.filter(t => t.status === "done").length} of ${tasks.length} done`} open>
      <ol className="agent-room-board">
        {tasks.map(t => (
          <li key={t.id} className={`is-${t.status}`}>
            <span>{t.id}. {t.title}</span>
            <small>{AGENT_NAMES[t.assignee]} · {t.status}{t.attempts ? ` · retry ${t.attempts}` : ""}{t.commit ? ` · ${t.commit}` : ""}</small>
          </li>
        ))}
      </ol>
    </SideSection>
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

// Stopped repo sessions keep their worktree for inspection; this clears them. Their branches, and every commit, stay.
export function WorktreeCleanup() {
  const [worktrees, setWorktrees] = useState<{ id: string; project: string; branch: string }[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    fetch("/api/room/worktrees", { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<{ worktrees?: { id: string; project: string; branch: string }[] }>) : null))
      .then(data => setWorktrees(data?.worktrees ?? []), () => setWorktrees([]));
  }, []);
  const clean = async () => {
    const res = await fetch("/api/room/worktrees", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (res.ok) setWorktrees([]);
    setStatus(res.ok ? "Removed. The branches are still in your repo." : "Could not remove them.");
  };
  if (worktrees.length === 0) return status ? <p className="agent-room-hint">{status}</p> : null;
  return (
    <section className="agent-room-gate" aria-label="Leftover worktrees">
      <p>{worktrees.length} stopped session{worktrees.length === 1 ? "" : "s"} still {worktrees.length === 1 ? "has a" : "have"} worktree: {worktrees.map(w => w.branch).join(", ")}</p>
      <button type="button" onClick={() => void clean()}>Remove worktrees (branches stay)</button> <small>{status}</small>
    </section>
  );
}

// A side-panel section, like a settings card: title, a one-line value and a chevron that opens the details.
export function SideSection({ title, value, open, children }: { title: string; value?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="agent-room-section" open={open}>
      <summary>
        <span className="agent-room-section-title">{title}</span>
        {value !== undefined && <span className="agent-room-section-value">{value}</span>}
        <ChevronRight size={14} aria-hidden="true" className="agent-room-section-chevron" />
      </summary>
      <div className="agent-room-section-body">{children}</div>
    </details>
  );
}

export const TEMPLATE_LABELS = { feature: "Feature", bugfix: "Bug fix", refactor: "Refactor", review: "Review only" } as const;

// Everything a new session needs. The settings live in the side panel, the task in the composer under the chat.
export function useBrief(agents?: Record<AgentId, Availability>, folders: string[] = [], repos: RepoChoice[] = []) {
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
  const [parallel, setParallel] = useState(false);
  const [template, setTemplate] = useState<keyof typeof TEMPLATE_LABELS>("feature");
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
    : template === "review" ? reviewBody : { template, models: chosenModels, project, task, ...(ownRoles ? { roles } : {}), subagents: { claude: claudeSubagents }, ...(inRepo ? { repo: chosenRepo?.dir } : {}), ...(checkCommand.trim() ? { check: checkCommand.trim() } : {}), limits, ...(parallel && template !== "bugfix" ? { parallel } : {}) };
  const canStart = missing.length === 0 && !(kind === "debate" && !chosenFolder) && !(kind === "build" && needsCheck && !checkCommand.trim());
  return {
    kind, setKind, project, setProject, task, setTask, ownRoles, setOwnRoles, roles, setRoles, question, setQuestion, chosenFolder, setFolder,
    judge, setJudge, claudeSubagents, setClaudeSubagents, setWhere, inRepo, chosenRepo, setRepoDir, checkCommand, setCheck, limits, setLimits,
    parallel, setParallel, template, setTemplate, models, setModels, needsCheck, missing, body, canStart, folders, repos,
  };
}
export type Brief = ReturnType<typeof useBrief>;

const BRIEF_FORM = "room-brief";

export function BriefSettings({ brief: b, quotaWarning }: { brief: Brief; quotaWarning?: string | null }) {
  const options = b.kind === "debate" ? (b.claudeSubagents ? "sub-agents on" : "sub-agents off")
    : `${b.checkCommand.trim() ? "checks on" : "no checks"} · ${b.limits.minutes} min`;
  return (
    <>
      <SideSection title="New session" value={b.kind === "debate" ? "Debate" : TEMPLATE_LABELS[b.template]} open>
        <div className="agent-room-kind" role="radiogroup" aria-label="Session type">
          <label><input type="radio" name="room-kind" checked={b.kind === "build"} onChange={() => b.setKind("build")} /> Build</label>
          <label><input type="radio" name="room-kind" checked={b.kind === "debate"} onChange={() => b.setKind("debate")} /> Debate</label>
        </div>
        {b.kind === "build" ? (
          <>
            <label>Kind of work
              <select value={b.template} onChange={e => b.setTemplate(e.target.value as Brief["template"])}>
                <option value="feature">Feature: discuss, plan, build</option>
                <option value="bugfix">Bug fix: failing test first</option>
                <option value="refactor">Refactor: behaviour must not change</option>
                <option value="review">Review only: findings, no edits</option>
              </select>
            </label>
            <div className="agent-room-kind" role="radiogroup" aria-label="Where">
              <label><input type="radio" name="room-where" checked={!b.inRepo} onChange={() => { b.setWhere("new"); b.setCheck(null); }} /> New project</label>
              <label><input type="radio" name="room-where" checked={b.inRepo} disabled={b.repos.length === 0} onChange={() => { b.setWhere("repo"); b.setCheck(null); }} /> Existing repo</label>
            </div>
            {b.inRepo && (
              <label>Repository
                <select value={b.chosenRepo?.dir ?? ""} onChange={e => { b.setRepoDir(e.target.value); b.setCheck(null); }}>
                  {b.repos.map(r => <option key={r.dir} value={r.dir}>{r.dir}</option>)}
                </select>
              </label>
            )}
            <label title={b.inRepo ? `Works on branch room/<name>-… in its own worktree; ${b.chosenRepo?.dir} is untouched until you merge.` : "Built in D:\\ascend-builds\\<name> as its own git repository."}>
              {b.inRepo ? "Branch name" : "Project name"}
              <input form={BRIEF_FORM} value={b.project} onChange={e => b.setProject(e.target.value)} pattern="[a-z0-9][a-z0-9\-]{0,39}" required placeholder={b.inRepo ? "fix-login" : "todo-system"} />
            </label>
            {b.inRepo && b.chosenRepo && <MemoryEditor key={b.chosenRepo.dir} dir={b.chosenRepo.dir} />}
          </>
        ) : (
          <>
            <label>Folder they may read
              <select form={BRIEF_FORM} value={b.chosenFolder} onChange={e => b.setFolder(e.target.value)} required>
                {b.folders.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label>Judge <AgentSelect label="Judge" value={b.judge} options={AGENT_IDS} onChange={b.setJudge} /></label>
          </>
        )}
      </SideSection>
      <SideSection title="Options" value={options} open={(b.kind === "build" && b.needsCheck && !b.checkCommand.trim()) || undefined}>
        {b.kind === "build" && (
          <>
            <label title="Runs in the project folder after each task; a failure sends the task back with the output.">
              Checks after every task{b.needsCheck ? " (required)" : ""}
              <input value={b.checkCommand} onChange={e => b.setCheck(e.target.value)} maxLength={500} placeholder="npm test" spellCheck={false} />
            </label>
            <fieldset className="agent-room-limits">
              <legend>Models</legend>
              <label>Codex <input list="room-codex-models" value={b.models.codex} onChange={e => b.setModels(m => ({ ...m, codex: e.target.value }))} placeholder="default" spellCheck={false} /></label>
              <label>Claude <input list="room-claude-models" value={b.models.claude} onChange={e => b.setModels(m => ({ ...m, claude: e.target.value }))} placeholder="default" spellCheck={false} /></label>
              <datalist id="room-codex-models"><option value="gpt-6-astra" /></datalist>
              <datalist id="room-claude-models"><option value="opus" /><option value="sonnet" /><option value="haiku" /></datalist>
            </fieldset>
            <fieldset className="agent-room-limits" title="The room pauses and asks you when one is reached.">
              <legend>Limits</legend>
              <label>Minutes <input type="number" min={5} max={720} value={b.limits.minutes} onChange={e => b.setLimits(l => ({ ...l, minutes: Number(e.target.value) }))} /></label>
              <label>Turns <input type="number" min={1} max={500} value={b.limits.turns} onChange={e => b.setLimits(l => ({ ...l, turns: Number(e.target.value) }))} /></label>
              <label>Rounds <input type="number" min={1} max={10} value={b.limits.rounds} onChange={e => b.setLimits(l => ({ ...l, rounds: Number(e.target.value) }))} /></label>
            </fieldset>
            {b.template !== "bugfix" && (
              <label className="agent-room-check" title="Independent tasks run at once in their own worktrees, then merge one at a time with checks after each.">
                <input type="checkbox" checked={b.parallel} onChange={e => b.setParallel(e.target.checked)} /> Parallel tasks (experimental)
              </label>
            )}
            <label className="agent-room-check"><input type="checkbox" checked={b.ownRoles} onChange={e => b.setOwnRoles(e.target.checked)} /> Set roles myself</label>
            {b.ownRoles && <RolesEditor value={b.roles} onChange={b.setRoles} />}
          </>
        )}
        <label className="agent-room-check" title="Codex always uses sub-agents; Antigravity has no switch yet.">
          <input type="checkbox" checked={b.claudeSubagents} onChange={e => b.setClaudeSubagents(e.target.checked)} /> Claude may use sub-agents
        </label>
      </SideSection>
      {quotaWarning && <p className="agent-room-hint is-problem" role="status">{quotaWarning}</p>}
    </>
  );
}

// The prompt box under the chat: what to build or debate, and Start. The side panel's fields belong to this form.
export function BriefComposer({ brief: b, act }: { brief: Brief; act: Act }) {
  const build = b.kind === "build";
  return (
    <form id={BRIEF_FORM} className="agent-room-composer" onSubmit={e => { e.preventDefault(); void act("/api/room/sessions", b.body); }}>
      <textarea value={build ? b.task : b.question} onChange={e => (build ? b.setTask : b.setQuestion)(e.target.value)} maxLength={4000} required rows={3}
        placeholder={build ? "What should they build?" : "What should they debate?"} aria-label={build ? "What should they build?" : "What should they debate?"} />
      <div className="agent-room-composer-bar">
        <small>{b.missing.length > 0 ? `Waiting for: ${b.missing.map(id => AGENT_NAMES[id]).join(", ")}` : build ? `${TEMPLATE_LABELS[b.template]} · ${b.inRepo ? "existing repo" : "new project"}` : "Debate · read-only"}</small>
        <button type="submit" disabled={!b.canStart}>Start</button>
      </div>
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
  const [draft, setDraft] = useState(tasks.map(t => ({ title: t.title, assignee: t.assignee, description: t.description, race: t.race === true, after: t.after })));
  const update = (index: number, patch: Partial<(typeof draft)[number]>) => setDraft(d => d.map((t, j) => (j === index ? { ...t, ...patch } : t)));
  return (
    <div className="agent-room-gate">
      <p>Review the plan. You can change titles and assignees.</p>
      <ol className="agent-room-plan-edit">
        {draft.map((t, i) => (
          <li key={i}>
            <input aria-label={`Task ${i + 1} title`} value={t.title} maxLength={120} onChange={e => update(i, { title: e.target.value })} />
            <AgentSelect label={`Task ${i + 1} assignee`} value={t.assignee} options={coders} onChange={assignee => update(i, { assignee })} />
            {coders.length > 1 && (
              <label className="agent-room-check" title="Every coder attempts this task in its own worktree; the checks and a judge pick the best attempt.">
                <input type="checkbox" checked={t.race} onChange={e => update(i, { race: e.target.checked })} /> Race all coders
              </label>
            )}
            {t.after && <small>Starts after task {t.after.join(", ")}</small>}
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
        <button onClick={() => {
          if (window.confirm(`Push ${branch} to origin and open a pull request into ${baseBranch}?`)) void act(GATE, { gate: "result", decision: "pr", memory });
        }}>Open pull request</button>
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
