"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AGENT_IDS, AGENT_NAMES, DEFAULT_ROLES, TERMINAL_STAGES,
  type AgentId, type Availability, type Message, type PlanTask, type Roles, type SessionMode, type SessionView, type Stage,
  type ConnectorChoice,
  type RepoChoice,
} from "./room-types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/neo/accordion";
import { Badge } from "@/components/neo/badge";
import { Button } from "@/components/neo/button";
import { Card } from "@/components/neo/card";
import { Checkbox } from "@/components/neo/checkbox";
import { Input } from "@/components/neo/input";
import { NativeSelect, NativeSelectOption } from "@/components/neo/native-select";
import { Textarea } from "@/components/neo/textarea";
import { messageLine, nearBottom, stepStates } from "./deck/deck-view";
import { Markdown } from "./markdown";
import { inlineSummary } from "./markdown-parse";
import { DiffView } from "./workflow-panel";
import { ProducedFiles } from "./produced-files";
import { SkillProposal } from "./skill-proposal";

export type Act = (path: string, body?: unknown) => Promise<void>;

const GATE = "/api/room/sessions/current/gate";
const RESUME = "/api/room/sessions/current/resume";

export function StageSteps({ stage, paused, mode = "build" }: { stage: Stage; paused: boolean; mode?: SessionMode }) {
  return (
    <ol className="agent-room-steps" aria-label="Session stage">
      {stepStates(stage, mode).map(step => (
        <li key={step.label} className={`is-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
          <Badge variant={step.state === "todo" ? "default" : "neutral"} className={step.state === "current" ? "bg-main" : undefined}>
            {step.label}{step.state === "current" && paused ? " · paused" : ""}
          </Badge>
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
      {messages.map((m, i) => (m.from === "room"
        ? <p key={`${m.seq ?? m.at}-${i}`} className="room-note">{m.text}</p>
        : <ChatMessage key={`${m.seq ?? m.at}-${i}`} message={m} />))}
    </div>
  );
}

const LONG_MESSAGE = { chars: 1600, lines: 28 };

function ChatMessage({ message: m }: { message: Message }) {
  const line = messageLine(m);
  const long = m.text.length > LONG_MESSAGE.chars || m.text.split("\n").length > LONG_MESSAGE.lines;
  const [open, setOpen] = useState(!long);
  return (
    <Card size="sm" className="room-msg gap-1.5 bg-secondary-background px-4">
      <header>
        <b className={`agent-room-name-${m.from}`}>{line.from}</b>
        {line.to && <span className="agent-room-to">→ {line.to}</span>}
        <time dateTime={m.at}>{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      </header>
      <div className={open ? "room-msg-body" : "room-msg-body is-folded"}><Markdown text={m.text} /></div>
      {long && <Button type="button" variant="neutral" size="xs" className="self-start" onClick={() => setOpen(o => !o)}>{open ? "Show less" : "Show more"}</Button>}
    </Card>
  );
}

export function TaskBoard({ tasks }: { tasks: PlanTask[] }) {
  return (
    <SideSection title="Plan" value={`${tasks.filter(t => t.status === "done").length} of ${tasks.length} done`} open>
      <ol className="agent-room-board">
        {tasks.map(t => (
          <li key={t.id} className={`is-${t.status}`}>
            <span>{t.id}. {t.title}</span>
            <small>{AGENT_NAMES[t.assignee]}{t.repo ? ` · ${t.repo}` : ""}{t.role ? ` · ${t.role}` : ""} · {t.status}{t.attempts ? ` · retry ${t.attempts}` : ""}{t.check ? (t.check.ok ? " · checks passed" : " · checks failed") : ""}{t.commit ? ` · ${t.commit}` : ""}</small>
          </li>
        ))}
      </ol>
    </SideSection>
  );
}

function AgentSelect({ value, options, label, onChange }: { value: AgentId; options: AgentId[]; label: string; onChange: (id: AgentId) => void }) {
  return (
    <NativeSelect size="sm" aria-label={label} value={value} onChange={e => onChange(e.target.value as AgentId)}>
      {options.map(id => <NativeSelectOption key={id} value={id}>{AGENT_NAMES[id]}</NativeSelectOption>)}
    </NativeSelect>
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
        <label key={id} className="agent-room-check"><Checkbox checked={value.coders.includes(id)} onCheckedChange={() => toggleCoder(id)} /> {AGENT_NAMES[id]}</label>
      ))}</span>
      <label>Reviewer{" "}
        <NativeSelect size="sm" aria-label="Reviewer" value={value.reviewer ?? ""} onChange={e => onChange({ ...value, reviewer: (e.target.value || null) as AgentId | null })}>
          <NativeSelectOption value="">None</NativeSelectOption>
          {AGENT_IDS.map(id => <NativeSelectOption key={id} value={id}>{AGENT_NAMES[id]}</NativeSelectOption>)}
        </NativeSelect>
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
    return res.ok;
  };
  // Saves first, so the pull request carries exactly the notes shown here.
  const offer = async () => {
    if (!window.confirm(`Save these notes, push a new branch of ${key} to origin and open a pull request that adds them to its AGENTS.md?`)) return;
    if (!(await save())) return;
    setStatus("Opening the pull request…");
    const res = await fetch("/api/room/memory/pr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo: dir }) });
    const data = await res.json().catch(() => ({})) as { url?: string; message?: string };
    setStatus(res.ok && data.url ? `Pull request opened: ${data.url}` : `Could not open the pull request. ${data.message ?? ""}`.trim());
  };
  if (text === null) return null;
  return (
    <details className="agent-room-memory">
      <summary>Project memory for {key} ({text ? text.split("\n").filter(Boolean).length : 0} notes)</summary>
      <Textarea value={text} rows={5} onChange={e => { setText(e.target.value); setStatus(""); }} aria-label={`Project memory for ${key}`} placeholder="One note per line. Agents read these at the start of every session in this repo." />
      <Button type="button" size="sm" onClick={() => void save()}>Save memory</Button>{" "}
      <Button type="button" size="sm" variant="neutral" disabled={!text.trim()} onClick={() => void offer()}>Open pull request to AGENTS.md</Button> <small>{status}</small>
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
    <Card size="sm" className="agent-room-gate flex-row flex-wrap items-center gap-2 px-4" aria-label="Leftover worktrees">
      <p>{worktrees.length} stopped session{worktrees.length === 1 ? "" : "s"} still {worktrees.length === 1 ? "has a" : "have"} worktree: {worktrees.map(w => w.branch).join(", ")}</p>
      <Button type="button" variant="neutral" size="sm" onClick={() => void clean()}>Remove worktrees (branches stay)</Button> <small>{status}</small>
    </Card>
  );
}

// A side-panel section, like a settings card: title, a one-line value and a chevron that opens the details.
export function SideSection({ title, value, open, force, children }: { title: string; value?: ReactNode; open?: boolean; force?: boolean; children: ReactNode }) {
  const [items, setItems] = useState<string[]>(open ? ["section"] : []);
  return (
    <Accordion value={force ? ["section"] : items} onValueChange={next => setItems(next as string[])} className="agent-room-section">
      <AccordionItem value="section">
        <AccordionTrigger className="gap-2 bg-secondary-background p-3 text-sm text-foreground">
          <span className="agent-room-section-title">{title}</span>
          {value !== undefined && <span className="agent-room-section-value">{value}</span>}
        </AccordionTrigger>
        <AccordionContent className="agent-room-section-body">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// The role sets for this session only; until the owner changes one, they follow the Role sets switches.
type SetSkill = { id: string; name: string; on: boolean; installed: boolean };
type SessionSet = { id: string; name: string; on: boolean; skills: SetSkill[] };

function SessionSets({ value, onChange }: { value: string[] | null; onChange: (sets: string[] | null) => void }) {
  const [sets, setSets] = useState<SessionSet[]>([]);
  useEffect(() => {
    fetch("/api/room/role-sets", { cache: "no-store" })
      .then(r => (r.ok ? (r.json() as Promise<{ sets?: SessionSet[] }>) : null))
      .then(data => setSets(data?.sets ?? []), () => setSets([]));
  }, []);
  if (!sets.length) return null;
  const chosen = value ?? sets.filter(s => s.on).map(s => s.id);
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter(c => c !== id) : [...chosen, id]);
  // Skills switched off inside a set are left out; only installed ones reach the agents.
  const skillsOf = (s: SessionSet) => s.skills.filter(k => k.on);
  return (
    <fieldset className="agent-room-limits agent-room-sets" title="Which role sets this session uses. Agents get these sets' installed skills.">
      <legend>Role sets for this session{value ? "" : " (from the switches)"}</legend>
      {sets.map(s => (
        <label key={s.id} className="agent-room-check" title={skillsOf(s).map(k => `${k.name}${k.installed ? "" : " (not installed)"}`).join("\n")}>
          <Checkbox checked={chosen.includes(s.id)} onCheckedChange={() => toggle(s.id)} /> {s.name}
        </label>
      ))}
      {sets.some(s => chosen.includes(s.id)) && (
        <ul className="agent-room-sets-skills">
          {sets.filter(s => chosen.includes(s.id)).map(s => (
            <li key={s.id}>
              <b>{s.name}:</b>{" "}
              {skillsOf(s).length ? skillsOf(s).map((k, i) => (
                <span key={k.id} className={k.installed ? undefined : "is-missing"}>{i ? ", " : ""}{k.name}{k.installed ? "" : " (not installed)"}</span>
              )) : "no skills switched on"}
            </li>
          ))}
        </ul>
      )}
      {value && <button type="button" className="agent-room-linkbtn" onClick={() => onChange(null)}>Reset to the Role sets switches</button>}
    </fieldset>
  );
}

export const TEMPLATE_LABELS ={ feature: "Feature", bugfix: "Bug fix", refactor: "Refactor", review: "Review only" } as const;

// Everything a new session needs. The settings live in the side panel, the task in the composer under the chat.
export function useBrief(agents?: Record<AgentId, Availability>, folders: string[] = [], repos: RepoChoice[] = [], buildsRoot = "D:\\ascend-builds", connectorChoices: ConnectorChoice[] = []) {
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
  const [extraRepos, setExtraRepos] = useState<string[]>([]);
  const [check, setCheck] = useState<string | null>(null);
  const [limits, setLimits] = useState({ minutes: 120, turns: 80, rounds: 3 });
  const [parallel, setParallel] = useState(false);
  const [raceGate, setRaceGate] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const [advisers, setAdvisers] = useState(false);
  const [lint, setLint] = useState("");
  // Files for the agents: a pasted screenshot, a PDF spec, notes. The room checks them again.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [coverage, setCoverage] = useState("");
  // A GitHub issue (repo builds) or pull request (Review only), as a number or link; the room reads it with gh.
  const [github, setGithub] = useState("");
  const [template, setTemplate] = useState<keyof typeof TEMPLATE_LABELS>("feature");
  const [models, setModels] = useState<{ codex: string; claude: string }>({ codex: "", claude: "" });
  const [preview, setPreview] = useState({ command: "", url: "" });
  // null: the session takes the role sets switched on in the Role sets section.
  const [sessionSets, setSessionSets] = useState<string[] | null>(null);
  const [connectors, setConnectors] = useState<string[]>([]);
  // A connector removed from settings since it was ticked is dropped.
  const chosenConnectors = connectors.filter(id => connectorChoices.some(c => c.id === id));
  const missing = AGENT_IDS.filter(id => agents?.[id]?.state !== "ready");
  const chosenFolder = folders.includes(folder) ? folder : folders[0] ?? "";
  const inRepo = where === "repo" && repos.length > 0;
  const chosenRepo = repos.find(r => r.dir === repoDir) ?? repos[0];
  // Several repos: the ones ticked besides the main repo (never the main repo itself).
  const chosenExtras = inRepo ? extraRepos.filter(d => d !== chosenRepo?.dir && repos.some(r => r.dir === d)).slice(0, 3) : [];
  // The suggested command follows the chosen repo until the owner edits it.
  const checkCommand = check ?? (inRepo ? chosenRepo?.check ?? "" : "");
  const needsCheck = template === "bugfix" || template === "refactor";
  const chosenModels = Object.fromEntries(Object.entries(models).filter(([, m]) => m.trim()).map(([a, m]) => [a, m.trim()]));
  // "Review only" runs through the read-only debate flow on the chosen repo, so nothing in it can change.
  const githubRef = github.trim();
  const reviewBody = githubRef && inRepo
    ? { mode: "debate", question: task, pr: githubRef, folder: chosenRepo?.dir, judge: "codex", subagents: { claude: claudeSubagents } }
    : { mode: "debate", question: `Code review only; do not change anything. Give prioritised findings with file and line references for: ${task}`, folder: chosenRepo?.dir ?? chosenFolder, judge: "codex", subagents: { claude: claudeSubagents } };
  const body = kind === "debate"
    ? { mode: "debate", question, folder: chosenFolder, judge, subagents: { claude: claudeSubagents } }
    : template === "review" ? reviewBody : { template, models: chosenModels, project, task, ...(ownRoles ? { roles } : {}), subagents: { claude: claudeSubagents }, ...(inRepo ? { repo: chosenRepo?.dir } : {}), ...(chosenExtras.length ? { extraRepos: chosenExtras } : {}), ...(inRepo && githubRef ? { issue: githubRef } : {}), ...(checkCommand.trim() ? { check: checkCommand.trim() } : {}), ...(lint.trim() ? { lint: lint.trim() } : {}), ...(coverage.trim() ? { coverage: coverage.trim() } : {}), limits, ...(parallel && template !== "bugfix" ? { parallel } : {}), ...(raceGate ? { raceGate } : {}), ...(keepGoing ? { keepGoing } : {}), ...(advisers ? { advisers } : {}),...(preview.command.trim() && preview.url.trim() ? { preview: { command: preview.command.trim(), url: preview.url.trim() } } : {}), ...(sessionSets ? { roleSets: sessionSets } : {}), ...(chosenConnectors.length ? { connectors: chosenConnectors } : {}), ...(attachments.length ? { attachments: attachments.map(({ name, data }) => ({ name, data })) } : {}) };
  // valid: the form is complete; canStart also needs every agent ready. A queued or scheduled session checks readiness when it starts.
  const valid = !(kind === "debate" && !chosenFolder) && !(kind === "build" && needsCheck && !checkCommand.trim());
  const canStart = missing.length === 0 && valid;
  return {
    kind, setKind, project, setProject, task, setTask, ownRoles, setOwnRoles, roles, setRoles, question, setQuestion, chosenFolder, setFolder,
    judge, setJudge, claudeSubagents, setClaudeSubagents, setWhere, inRepo, chosenRepo, setRepoDir, chosenExtras, setExtraRepos, checkCommand, setCheck, limits, setLimits,
    parallel, setParallel, raceGate, setRaceGate, keepGoing, setKeepGoing, advisers, setAdvisers, attachments, setAttachments, lint, setLint, coverage, setCoverage, github, setGithub, template, setTemplate, models, setModels, preview, setPreview, sessionSets, setSessionSets, connectorChoices, chosenConnectors, setConnectors, needsCheck, missing, body, valid, canStart, folders, repos, buildsRoot,
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
              <NativeSelect className="w-full" value={b.template} onChange={e => b.setTemplate(e.target.value as Brief["template"])}>
                <NativeSelectOption value="feature">Feature: discuss, plan, build</NativeSelectOption>
                <NativeSelectOption value="bugfix">Bug fix: failing test first</NativeSelectOption>
                <NativeSelectOption value="refactor">Refactor: behaviour must not change</NativeSelectOption>
                <NativeSelectOption value="review">Review only: findings, no edits</NativeSelectOption>
              </NativeSelect>
            </label>
            <div className="agent-room-kind" role="radiogroup" aria-label="Where">
              <label><input type="radio" name="room-where" checked={!b.inRepo} onChange={() => { b.setWhere("new"); b.setCheck(null); }} /> New project</label>
              <label><input type="radio" name="room-where" checked={b.inRepo} disabled={b.repos.length === 0} onChange={() => { b.setWhere("repo"); b.setCheck(null); }} /> Existing repo</label>
            </div>
            {b.inRepo && (
              <label>Repository
                <NativeSelect className="w-full" value={b.chosenRepo?.dir ?? ""} onChange={e => { b.setRepoDir(e.target.value); b.setCheck(null); }}>
                  {b.repos.map(r => <NativeSelectOption key={r.dir} value={r.dir}>{r.dir}</NativeSelectOption>)}
                </NativeSelect>
              </label>
            )}
            {b.inRepo && b.template !== "review" && b.repos.length > 1 && (
              <fieldset className="agent-room-limits is-stacked" title="One plan across several repos: each task works in one repo's worktree, and the result gate merges, opens pull requests, keeps or deletes every branch together. Tasks then run one at a time and never race.">
                <legend>Also change (up to 3)</legend>
                {b.repos.filter(r => r.dir !== b.chosenRepo?.dir).map(r => (
                  <label key={r.dir} className="agent-room-check">
                    <Checkbox checked={b.chosenExtras.includes(r.dir)} disabled={!b.chosenExtras.includes(r.dir) && b.chosenExtras.length >= 3}
                      onCheckedChange={checked => b.setExtraRepos(list => checked ? [...list, r.dir] : list.filter(d => d !== r.dir))} /> {r.dir}
                  </label>
                ))}
              </fieldset>
            )}
            <label title={b.inRepo ? `Works on branch room/<name>-… in its own worktree; ${b.chosenRepo?.dir} is untouched until you merge.` : `Built in ${b.buildsRoot}\\<name> as its own git repository.`}>
              {b.inRepo ? "Branch name" : "Project name"}
              <Input form={BRIEF_FORM} value={b.project} onChange={e => b.setProject(e.target.value)} pattern="[a-z0-9][a-z0-9\-]{0,39}" required placeholder={b.inRepo ? "fix-login" : "todo-system"} />
            </label>
            {b.inRepo && (
              <label title={b.template === "review" ? "The agents review this pull request's diff. Afterwards you can post their verdict to it as a comment." : "The room reads this issue with gh and adds it to the task. The prompt box may then stay empty."}>
                {b.template === "review" ? "Pull request (optional)" : "GitHub issue (optional)"}
                <Input value={b.github} onChange={e => b.setGithub(e.target.value)} placeholder={b.template === "review" ? "42 or a github.com/…/pull/42 link" : "17 or a github.com/…/issues/17 link"} />
              </label>
            )}
            {b.inRepo && b.chosenRepo && <MemoryEditor key={b.chosenRepo.dir} dir={b.chosenRepo.dir} />}
          </>
        ) : (
          <>
            <label>Folder they may read
              <NativeSelect className="w-full" form={BRIEF_FORM} value={b.chosenFolder} onChange={e => b.setFolder(e.target.value)} required>
                {b.folders.map(f => <NativeSelectOption key={f} value={f}>{f}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label>Judge <AgentSelect label="Judge" value={b.judge} options={AGENT_IDS} onChange={b.setJudge} /></label>
          </>
        )}
      </SideSection>
      <SideSection title="Options" value={options} force={b.kind === "build" && b.needsCheck && !b.checkCommand.trim()}>
        {b.kind === "build" && (
          <>
            <label title="Runs in the project folder after each task; a failure sends the task back with the output.">
              Checks after every task{b.needsCheck ? " (required)" : ""}
              <Input value={b.checkCommand} onChange={e => b.setCheck(e.target.value)} maxLength={500} placeholder="npm test" spellCheck={false} />
            </label>
            <label title="Runs after a task's checks pass. Shown per task in Workflow; never sends a task back.">
              Lint after every task (optional)
              <Input value={b.lint} onChange={e => b.setLint(e.target.value)} maxLength={500} placeholder="npx eslint ." spellCheck={false} />
            </label>
            <label title="Runs after a task's checks pass. The total is read from a c8, istanbul, Node test-runner or pytest-cov summary and shown per task in Workflow.">
              Coverage after every task (optional)
              <Input value={b.coverage} onChange={e => b.setCoverage(e.target.value)} maxLength={500} placeholder="npx c8 npm test" spellCheck={false} />
            </label>
            <SessionSets value={b.sessionSets} onChange={b.setSessionSets} />
            {b.connectorChoices.length > 0 && (
              <fieldset className="agent-room-limits is-stacked" title="MCP servers from room settings. Claude and Codex get their tools in every turn; Antigravity keeps the servers in its own agy mcp list.">
                <legend>MCP connectors</legend>
                {b.connectorChoices.map(c => (
                  <label key={c.id} className="agent-room-check" title={c.description || c.id}>
                    <Checkbox checked={b.chosenConnectors.includes(c.id)} onCheckedChange={checked => b.setConnectors(list => checked ? [...list, c.id] : list.filter(id => id !== c.id))} /> {c.name}
                    {c.missing.length > 0 && <small className="is-problem">{c.missing.join(", ")} not set</small>}
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset className="agent-room-limits is-stacked" title="Before a design review the room starts the app, opens the URL in headless Edge or Chrome and gives the reviewer a screenshot. Leave empty to review the diff only.">
              <legend>App preview for design reviews</legend>
              <label>Start command <Input className="h-9" value={b.preview.command} onChange={e => b.setPreview(p => ({ ...p, command: e.target.value }))} maxLength={500} placeholder="npm run dev" spellCheck={false} /></label>
              <label>URL <Input className="h-9" value={b.preview.url} onChange={e => b.setPreview(p => ({ ...p, url: e.target.value }))} placeholder="http://localhost:5173" spellCheck={false} /></label>
            </fieldset>
            <fieldset className="agent-room-limits">
              <legend>Models</legend>
              <label>Codex <Input className="h-9" list="room-codex-models" value={b.models.codex} onChange={e => b.setModels(m => ({ ...m, codex: e.target.value }))} placeholder="default" spellCheck={false} /></label>
              <label>Claude <Input className="h-9" list="room-claude-models" value={b.models.claude} onChange={e => b.setModels(m => ({ ...m, claude: e.target.value }))} placeholder="default" spellCheck={false} /></label>
              <datalist id="room-codex-models"><option value="gpt-6-astra" /></datalist>
              <datalist id="room-claude-models"><option value="opus" /><option value="sonnet" /><option value="haiku" /></datalist>
            </fieldset>
            <fieldset className="agent-room-limits" title="The room pauses and asks you when one is reached.">
              <legend>Limits</legend>
              <label>Minutes <Input className="h-9" type="number" min={5} max={720} value={b.limits.minutes} onChange={e => b.setLimits(l => ({ ...l, minutes: Number(e.target.value) }))} /></label>
              <label>Turns <Input className="h-9" type="number" min={1} max={500} value={b.limits.turns} onChange={e => b.setLimits(l => ({ ...l, turns: Number(e.target.value) }))} /></label>
              <label>Rounds <Input className="h-9" type="number" min={1} max={10} value={b.limits.rounds} onChange={e => b.setLimits(l => ({ ...l, rounds: Number(e.target.value) }))} /></label>
            </fieldset>
            {b.template !== "bugfix" && (
              <label className="agent-room-check" title="Independent tasks run at once in their own worktrees, then merge one at a time with checks after each.">
                <Checkbox checked={b.parallel} onCheckedChange={checked => b.setParallel(checked)} /> Parallel tasks (experimental)
              </label>
            )}
            <label className="agent-room-check" title="When several coders race a task and more than one attempt passes, the room shows their changes side by side and waits for you to keep one.">
              <Checkbox checked={b.raceGate} onCheckedChange={checked => b.setRaceGate(checked)} /> Let me pick race winners
            </label>
            <label className="agent-room-check" title="When a task would pause at its round limit or be skipped, the orchestrator judges whether it is still making progress and, if so, gives it another round (up to 5). Session minutes and turns still apply.">
              <Checkbox checked={b.keepGoing} onCheckedChange={checked => b.setKeepGoing(checked)} /> Keep going on failing tasks
            </label>
            <label className="agent-room-check" title="Before each task's first round, every other agent in the session reads the task and gives short read-only advice; the assigned coder then does the work with that advice in its prompt. One extra turn per adviser per task.">
              <Checkbox checked={b.advisers} onCheckedChange={checked => b.setAdvisers(checked)} /> Advisers and one actor
            </label>
            <label className="agent-room-check"><Checkbox checked={b.ownRoles} onCheckedChange={checked => b.setOwnRoles(checked)} /> Set roles myself</label>
            {b.ownRoles && <RolesEditor value={b.roles} onChange={b.setRoles} />}
          </>
        )}
        <label className="agent-room-check" title="Codex always uses sub-agents; Antigravity has no switch yet.">
          <Checkbox checked={b.claudeSubagents} onCheckedChange={checked => b.setClaudeSubagents(checked)} /> Claude may use sub-agents
        </label>
      </SideSection>
      {quotaWarning && <p className="agent-room-hint is-problem" role="status">{quotaWarning}</p>}
    </>
  );
}

export type Attachment = { name: string; size: number; data: string };
const ATTACH_TYPES = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.md,.txt";
const MAX_ATTACH = 5;
const MAX_ATTACH_FILE = 8 * 1024 * 1024;
const MAX_ATTACH_TOTAL = 12 * 1024 * 1024;

// A file as base64, the way the room's start body carries it.
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Adds files within the limits; returns a message for the ones refused.
async function addAttachments(current: Attachment[], files: File[], pasted: boolean): Promise<{ next: Attachment[]; problem: string | null }> {
  const next = [...current];
  for (const [i, file] of files.entries()) {
    if (next.length >= MAX_ATTACH) return { next, problem: `At most ${MAX_ATTACH} attachments.` };
    if (file.size > MAX_ATTACH_FILE || next.reduce((sum, a) => sum + a.size, 0) + file.size > MAX_ATTACH_TOTAL) return { next, problem: `${file.name}: at most 8 MB a file and 12 MB in all.` };
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1] ?? "png";
    // A pasted screenshot arrives as "image.png"; give it a clearer name.
    const name = pasted ? `screenshot-${Date.now().toString(36)}${i ? `-${i + 1}` : ""}.${ext}` : file.name;
    next.push({ name, size: file.size, data: await readBase64(file) });
  }
  return { next, problem: null };
}

const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// The prompt box under the chat: what to build or debate, and Start. The side panel's fields belong to this form.
// busy: a session runs, so the form queues the next one instead of starting it.
export function BriefComposer({ brief: b, act, busy = false }: { brief: Brief; act: Act; busy?: boolean }) {
  const build = b.kind === "build";
  const [at, setAt] = useState("");
  const [repeat, setRepeat] = useState<"once" | "daily" | "weekdays">("once");
  const hasText = Boolean((build ? b.task : b.question).trim() || (build && b.inRepo && b.github.trim()));
  // Attachments only travel with a session started now.
  const canWait = b.valid && hasText && b.attachments.length === 0;
  const attachable = build && b.template !== "review";
  const picker = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Adds run one after another from the latest list, so a paste and a pick close together both land.
  const latest = useRef(b.attachments);
  const queue = useRef(Promise.resolve());
  useEffect(() => { latest.current = b.attachments; }, [b.attachments]);
  const add = (files: File[], pasted = false) => {
    queue.current = queue.current.then(async () => {
      const { next, problem: why } = await addAttachments(latest.current, files, pasted);
      latest.current = next;
      b.setAttachments(next);
      setProblem(why);
    }).catch(() => setProblem("A file could not be read."));
  };
  return (
    <form id={BRIEF_FORM} className="agent-room-composer" onSubmit={e => { e.preventDefault(); void (busy ? act("/api/room/queue", { body: b.body }) : act("/api/room/sessions", b.body)); }}>
      <Textarea className="min-h-[72px] resize-y border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0" value={build ? b.task : b.question} onChange={e => (build ? b.setTask : b.setQuestion)(e.target.value)} maxLength={4000} required={!(build && b.inRepo && b.github.trim())} rows={3}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && b.canStart) e.currentTarget.form?.requestSubmit(); }}
        onPaste={e => {
          const images = [...e.clipboardData.files].filter(f => f.type.startsWith("image/"));
          if (!attachable || !images.length) return;
          e.preventDefault();
          void add(images, true);
        }}
        placeholder={build ? (b.inRepo ? "What should they build? @path/to/file and @diff point at your repo" : "What should they build?") : "What should they debate?"} aria-label={build ? "What should they build?" : "What should they debate?"} />
      {attachable && b.attachments.length > 0 && (
        <ul className="agent-room-attachments" aria-label="Attachments">
          {b.attachments.map(a => (
            <li key={a.name}>
              <span>{a.name}</span><small>{sizeLabel(a.size)}</small>
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => b.setAttachments(b.attachments.filter(x => x !== a))}>×</button>
            </li>
          ))}
        </ul>
      )}
      {problem && <p role="alert" className="agent-room-error">{problem}</p>}
      <div className="agent-room-composer-bar">
        {attachable && (
          <>
            <input ref={picker} type="file" multiple accept={ATTACH_TYPES} hidden onChange={e => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <Button type="button" variant="neutral" size="sm" onClick={() => picker.current?.click()} title="Attach a screenshot, a PDF spec or notes (or paste an image into the box)">Attach</Button>
          </>
        )}
        <small>{b.missing.length > 0 ? `Waiting for: ${b.missing.map(id => AGENT_NAMES[id]).join(", ")}` : build ? `${TEMPLATE_LABELS[b.template]} · ${b.inRepo ? "existing repo" : "new project"}` : "Debate · read-only"}</small>
        <details className="agent-room-schedule">
          <summary>Schedule</summary>
          <label>First run <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></label>
          <label>Repeat
            <select value={repeat} onChange={e => setRepeat(e.target.value as typeof repeat)}>
              <option value="once">Once</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option>
            </select>
          </label>
          <Button type="button" size="sm" variant="neutral" disabled={!canWait || !at}
            title={b.attachments.length ? "Attachments only travel with a session started now" : "Adds the session to the queue at this time"}
            onClick={() => void act("/api/room/schedules", { body: b.body, at: new Date(at).toISOString(), repeat })}>Schedule</Button>
        </details>
        <Button type="submit" disabled={busy ? !canWait : !b.canStart} title={busy ? "Starts when the running session ends" : "Ctrl+Enter"}>{busy ? "Add to queue" : "Start"}</Button>
      </div>
    </form>
  );
}

// act is given only for the live session, so a pull-request review can be posted from it once.
export function VerdictPanel({ session, act }: { session: SessionView; act?: Act }) {
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
    <Card size="sm" className="agent-room-verdict bg-secondary-background px-4" aria-label="Verdict">
      <h2>Verdict</h2>
      <div className="agent-room-verdict-text"><Markdown text={answer} /></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" size="sm" onClick={download}>Download .md</Button>
        {session.pr && act && !session.pr.posted && (
          <Button size="sm" onClick={() => { if (window.confirm(`Post this verdict to pull request #${session.pr?.number} on GitHub as a comment (not an approval)?`)) void act("/api/room/sessions/current/post-review", {}); }}>
            Post to PR #{session.pr.number}
          </Button>
        )}
        {session.pr?.posted && <a className="self-center underline" href={session.pr.url} target="_blank" rel="noreferrer">Posted to PR #{session.pr.number}</a>}
      </div>
    </Card>
  );
}

function RolesGate({ initial, act }: { initial: Roles; act: Act }) {
  const [roles, setRoles] = useState(initial);
  return (
    <div className="agent-room-gate">
      <p>The agents proposed these roles. Edit them or approve.</p>
      <RolesEditor value={roles} onChange={setRoles} />
      {roles.wear && (
        <p className="agent-room-badges" aria-label="Role sets worn">
          {AGENT_IDS.flatMap(id => (roles.wear?.[id] ?? []).map(set => <Badge key={`${id}-${set}`} variant="neutral">{AGENT_NAMES[id]}: {set}</Badge>))}
        </p>
      )}
      <Button size="sm" onClick={() => act(GATE, { gate: "roles", decision: "approve", roles })}>Approve roles</Button>
    </div>
  );
}

function PlanGate({ tasks, coders, act }: { tasks: PlanTask[]; coders: AgentId[]; act: Act }) {
  const [draft, setDraft] = useState(tasks.map(t => ({ title: t.title, assignee: t.assignee, description: t.description, race: t.race === true, after: t.after, role: t.role, repo: t.repo })));
  const update = (index: number, patch: Partial<(typeof draft)[number]>) => setDraft(d => d.map((t, j) => (j === index ? { ...t, ...patch } : t)));
  return (
    <div className="agent-room-gate">
      <p>Review the plan. You can change titles and assignees.</p>
      <ol className="agent-room-plan-edit">
        {draft.map((t, i) => (
          <li key={i}>
            <Input className="h-9 w-auto min-w-48 flex-1" aria-label={`Task ${i + 1} title`} value={t.title} maxLength={120} onChange={e => update(i, { title: e.target.value })} />
            <AgentSelect label={`Task ${i + 1} assignee`} value={t.assignee} options={coders} onChange={assignee => update(i, { assignee })} />
            {t.role && <Badge variant="neutral" title="Role set: the coder gets this set's skills">{t.role}</Badge>}
            {t.repo && <Badge variant="neutral" title="This task works in this repo's worktree">{t.repo}</Badge>}
            {coders.length > 1 && (
              <label className="agent-room-check" title="Every coder attempts this task in its own worktree; the checks and a judge pick the best attempt.">
                <Checkbox checked={t.race} onCheckedChange={checked => update(i, { race: checked })} /> Race all coders
              </label>
            )}
            {t.after && <small>Starts after task {t.after.join(", ")}</small>}
            <p>{t.description}</p>
          </li>
        ))}
      </ol>
      <Button size="sm" onClick={() => act(GATE, { gate: "plan", decision: "approve", plan: { tasks: draft } })}>Approve plan</Button>
    </div>
  );
}

function PausePanel({ session, act }: { session: SessionView; act: Act }) {
  const coders = session.roles?.coders ?? [];
  const [agent, setAgent] = useState<AgentId>(coders[0] ?? "claude");
  return (
    <div className="agent-room-gate" role="alert">
      <p>Paused: {session.pause?.reason}</p>
      <Button size="sm" onClick={() => act(RESUME, { action: "retry" })}>Retry</Button>
      {session.stage === "build" && coders.length > 0 && (
        <>
          <AgentSelect label="Reassign to" value={agent} options={coders} onChange={setAgent} />
          <Button size="sm" variant="neutral" onClick={() => act(RESUME, { action: "reassign", agent })}>Reassign</Button>
        </>
      )}
      <Button size="sm" variant="danger" onClick={() => act(RESUME, { action: "stop" })}>Stop</Button>
    </div>
  );
}

// The passing attempts of a raced task, side by side; the judge's pick is marked and kept by default.
function RaceGate({ task, act }: { task: PlanTask; act: Act }) {
  const { pick, pending } = task.raced ?? {};
  if (!pending) return null;
  return (
    <div className="agent-room-gate">
      <p>Task {task.id}, {task.title}: {pending.attempts.length} attempts passed. Keep one; the others are deleted.</p>
      <div className="agent-room-race">
        {pending.attempts.map(a => (
          <section key={a.agent} aria-label={`${AGENT_NAMES[a.agent]}'s attempt`}>
            <h3>{AGENT_NAMES[a.agent]} {a.agent === pick && <Badge>Judge&apos;s pick</Badge>}</h3>
            {a.check && <small>Checks {a.check.ok ? "passed" : "failed"} ({Math.round(a.check.ms / 1000)}s)</small>}
            <DiffView commit={`attempt:${a.agent}`} label="Show changes" />
            <Button size="sm" variant={a.agent === pick ? "default" : "neutral"}
              onClick={() => act(GATE, a.agent === pick ? { gate: "race", decision: "approve" } : { gate: "race", decision: "pick", agent: a.agent })}>
              Keep {AGENT_NAMES[a.agent]}&apos;s attempt
            </Button>
          </section>
        ))}
      </div>
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
          <Checkbox checked={note.keep} onCheckedChange={checked => update(notes.map((n, j) => (j === i ? { ...n, keep: checked } : n)))} aria-label={`Keep note ${i + 1}`} />
          <Input className="h-9" value={note.text} maxLength={200} onChange={e => update(notes.map((n, j) => (j === i ? { ...n, text: e.target.value } : n)))} aria-label={`Note ${i + 1}`} />
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
          {options.map(option => <Button key={option} type="button" variant="neutral" size="xs" onClick={() => setNote(option)}>{option}</Button>)}
        </div>
      )}
      <Textarea aria-label={`What should change in the ${gate}?`} value={note} maxLength={2000} rows={2} onChange={e => setNote(e.target.value)} placeholder="What should change?" />
      <Button type="button" size="sm" variant="neutral" disabled={!note.trim()} onClick={() => act(GATE, { gate, decision: "revise", note: note.trim() })}>Request changes</Button>
    </div>
  );
}

export function GateBar({ session, act }: { session: SessionView; act: Act }) {
  const waiting = Boolean(session.pause) || (session.stage.startsWith("gate-") && session.stage !== "gate-race");
  const working = !waiting && !TERMINAL_STAGES.includes(session.stage) && !session.stage.startsWith("gate-");
  return (
    <>
      <GateBarInner key={`${session.id}-${session.stage}`} session={session} act={act} />
      {waiting && session.mode !== "debate" && <RewindControl key={`${session.id}-rewind`} session={session} act={act} />}
      {!TERMINAL_STAGES.includes(session.stage) && <OwnerNote key={`${session.id}-note`} working={working} act={act} />}
    </>
  );
}

// Sends a waiting build back to its roles, its plan, or a task and everything after it; the work from that task on is redone.
function RewindControl({ session, act }: { session: SessionView; act: Act }) {
  const tasks = session.plan?.tasks ?? [];
  const [to, setTo] = useState(tasks.length ? `task:${tasks[0].id}` : "plan");
  const label = to.startsWith("task:") ? `task ${to.slice(5)} and everything after it` : `the ${to}`;
  return (
    <details className="agent-room-rewind">
      <summary>Go back to an earlier step</summary>
      <label>Redo from
        <select value={to} onChange={e => setTo(e.target.value)}>
          <option value="roles">Roles</option>
          {session.roles && <option value="plan">Plan</option>}
          {tasks.map(t => <option key={t.id} value={`task:${t.id}`}>Task {t.id}: {t.title}</option>)}
        </select>
      </label>
      <Button size="sm" variant="neutral" onClick={() => {
        const ask = to.startsWith("task:") ? `Redo ${label}? Their committed work is undone first.` : `Go back to ${label}? Committed work stays.`;
        if (window.confirm(ask)) void act("/api/room/sessions/current/rewind", to.startsWith("task:") ? { to: "task", task: Number(to.slice(5)) } : { to });
      }}>Go back</Button>
    </details>
  );
}

// A note to the agents while the session runs; it joins every later prompt.
function OwnerNote({ working, act }: { working: boolean; act: Act }) {
  const [text, setText] = useState("");
  return (
    <form className="agent-room-note" onSubmit={e => { e.preventDefault(); void act("/api/room/sessions/current/note", { text }).then(() => setText("")); }}>
      <Input value={text} onChange={e => setText(e.target.value)} maxLength={1000} aria-label="Note to the agents"
        placeholder={working ? "Note to the agents: it joins their next turn" : "Note to the agents for the next steps"} />
      <Button type="submit" size="sm" variant="neutral" disabled={!text.trim()}>Send note</Button>
    </form>
  );
}

function GateBarInner({ session, act }: { session: SessionView; act: Act }) {
  // Seeded once per gate (GateBar keys this by stage), so polling cannot undo the owner's edits.
  const [proposal] = useState(() => session.attention?.memory ?? []);
  const [memory, setMemory] = useState(proposal);
  if (session.pause) return <PausePanel session={session} act={act} />;
  const options = session.attention?.options ?? [];
  // The same words Vision speaks, so the page and the voice assistant agree.
  const summary = session.attention?.summary ? <div className="agent-room-summary"><Markdown text={inlineSummary(session.attention.summary)} /></div> : null;
  if (session.stage === "gate-roles" && session.roles) {
    return <>{summary}<RolesGate key={session.id} initial={session.roles} act={act} /><ChangeRequest key={`${session.id}-roles`} gate="roles" options={options} act={act} /></>;
  }
  if (session.stage === "gate-plan" && session.plan) {
    return <>{summary}<PlanGate key={session.id} tasks={session.plan.tasks} coders={session.roles?.coders ?? []} act={act} /><ChangeRequest key={`${session.id}-plan`} gate="plan" options={options} act={act} /></>;
  }
  if (session.stage === "gate-race" && session.plan) {
    const task = session.plan.tasks.find(t => t.id === session.raceTask);
    return task ? <>{summary}<RaceGate task={task} act={act} /></> : null;
  }
  if (session.stage === "gate-result" && session.repo) {
    const { branch, baseBranch, dir } = session.repo;
    return (
      <div className="agent-room-gate">
        {summary}
        <p>Branch <code>{branch}</code> of <code>{dir}</code>{session.extraRepos?.map(e => <span key={e.id}>, and of <code>{e.dir}</code>{e.finished ? ` (${e.finished === "merge" ? "merged" : e.finished === "pr" ? "pull request opened" : e.finished === "accept" ? "kept" : "deleted"})` : ""}</span>)}.{session.extraRepos?.length ? " Your decision applies to every repo." : ""}</p>
        <DiffView commit="all" label="Show all changes on the branch" />
        <ProducedFiles sessionId={session.id} />
        <MemoryPicker proposal={proposal} onChange={setMemory} />
        {session.skillProposal && <SkillProposal key={`${session.id}-skill`} proposal={session.skillProposal} />}
        <Button size="sm" onClick={() => act(GATE, { gate: "result", decision: "merge", memory })}>Merge into {baseBranch}</Button>
        <Button size="sm" variant="neutral" onClick={() => act(GATE, { gate: "result", decision: "accept", memory })}>Keep branch</Button>
        <Button size="sm" variant="neutral" onClick={() => {
          if (window.confirm(`Push ${branch} to origin and open a pull request into ${baseBranch}?`)) void act(GATE, { gate: "result", decision: "pr", memory });
        }}>Open pull request</Button>
        <Button size="sm" variant="danger" onClick={() => act(GATE, { gate: "result", decision: "reject" })}>Reject and delete branch</Button>
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
        <ProducedFiles sessionId={session.id} />
        <MemoryPicker proposal={proposal} onChange={setMemory} />
        {session.skillProposal && <SkillProposal key={`${session.id}-skill`} proposal={session.skillProposal} />}
        <Button size="sm" onClick={() => act(GATE, { gate: "result", decision: "accept", memory })}>Accept</Button>
        <Button size="sm" variant="danger" onClick={() => act(GATE, { gate: "result", decision: "reject" })}>Reject</Button>
      </div>
    );
  }
  return null;
}
