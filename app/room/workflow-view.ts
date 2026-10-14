import { BUILD_STEPS, DEBATE_STEPS, stepStates } from "./deck/deck-view";
import { AGENT_IDS, type AgentId, type Message, type PlanTask, type SessionView } from "./room-types";

export type WorkflowStage = { label: string; state: "done" | "current" | "todo"; ms: number | null };
export type WorkflowTask = {
  id: number; title: string; assignee: AgentId; status: PlanTask["status"]; commit: string | null; notes: string;
  rounds: number; reviews: number; ms: number | null; messages: Message[];
  roundGroups: Message[][]; needsAttention: boolean;
};
export type RunSummary = { ms: number | null; turns: Record<AgentId, number>; retries: number; problems: number };
export type Lanes = { start: number; end: number; rows: { agent: AgentId; spans: { start: number; end: number }[] }[] };
export type WorkflowView = { stages: WorkflowStage[]; tasks: WorkflowTask[]; summary: RunSummary; lanes: Lanes };

// Room lines that mean something went wrong: a failed or invalid turn, or a pause.
const PROBLEM = /turn failed|^Invalid answer|^Paused:/;
const isProblem = (m: Message) => m.from === "room" && PROBLEM.test(m.text);
const isTurn = (m: Message) => m.from !== "room" && m.kind !== "subagent";
// Three or more coder rounds on one task usually means the coder and reviewer are going in circles.
export const LOOPING = 3;

const TASK_OF = /^Task (\d+):/;
const ACTIVE = new Set(["running", "review"]);

// Pure view of where the time went: per step, then per task with its coder ↔ reviewer rounds.
export function workflowView(session: SessionView, now: number): WorkflowView {
  const mode = session.mode === "debate" ? "debate" : "build";
  const log = session.stageLog ?? [];
  const spans = log.map((entry, i) => ({
    stage: entry.stage,
    ms: (i + 1 < log.length ? Date.parse(log[i + 1].at) : entry.stage === session.stage && !TERMINAL.has(entry.stage) ? now : NaN) - Date.parse(entry.at),
  }));
  const groups = mode === "debate" ? DEBATE_STEPS : BUILD_STEPS;
  const stages = stepStates(session.stage, mode).map((step, i) => {
    const mine = spans.filter(s => groups[i].stages.includes(s.stage) && Number.isFinite(s.ms));
    return { label: step.label, state: step.state, ms: mine.length ? mine.reduce((sum, s) => sum + s.ms, 0) : null };
  });

  const finishAt = log.find(e => e.stage === "finish")?.at;
  const byTask = new Map<number, Message[]>();
  const firstAssign = new Map<number, number>();
  let current: number | null = null;
  for (const m of session.transcript) {
    if (finishAt && m.at >= finishAt) break;
    const assigned = m.kind === "assign" ? TASK_OF.exec(m.text) : null;
    if (assigned) {
      current = Number(assigned[1]);
      if (!firstAssign.has(current)) firstAssign.set(current, Date.parse(m.at));
    }
    if (current !== null) byTask.set(current, [...(byTask.get(current) ?? []), m]);
  }
  const starts = [...firstAssign.entries()].sort((a, b) => a[1] - b[1]);
  const tasks = (session.plan?.tasks ?? []).map(task => {
    const messages = byTask.get(task.id) ?? [];
    const start = firstAssign.get(task.id);
    const next = starts.find(([, at]) => start !== undefined && at > start)?.[1];
    const end = next ?? (ACTIVE.has(task.status) ? now : messages.length ? Date.parse(messages.at(-1)!.at) : undefined);
    const roundGroups: Message[][] = [];
    for (const m of messages) {
      if (m.kind === "assign" || roundGroups.length === 0) roundGroups.push([]);
      roundGroups.at(-1)!.push(m);
    }
    const rounds = messages.filter(m => m.kind === "assign").length;
    return {
      id: task.id, title: task.title, assignee: task.assignee, status: task.status, commit: task.commit, notes: task.notes,
      rounds, roundGroups,
      needsAttention: task.status === "skipped" || rounds >= LOOPING || messages.some(isProblem),
      reviews: session.roles?.reviewer ? messages.filter(m => m.from === session.roles!.reviewer).length : 0,
      ms: start !== undefined && end !== undefined ? end - start : null,
      messages,
    };
  });
  const ended = TERMINAL.has(session.stage);
  const first = log[0]?.at ?? session.transcript[0]?.at;
  const start = first ? Date.parse(first) : now;
  const end = ended ? Date.parse(log.at(-1)?.at ?? session.transcript.at(-1)?.at ?? new Date(now).toISOString()) : now;
  const turns = Object.fromEntries(AGENT_IDS.map(id => [id, 0])) as Record<AgentId, number>;
  for (const m of session.transcript) if (isTurn(m)) turns[m.from as AgentId] += 1;
  const summary = {
    ms: first ? end - start : null,
    turns,
    retries: tasks.reduce((sum, t) => sum + Math.max(0, t.rounds - 1), 0),
    problems: session.transcript.filter(isProblem).length,
  };
  // The room runs one agent at a time, so a turn spans from the previous message to the agent's reply.
  const rows = AGENT_IDS.map(agent => ({ agent, spans: [] as { start: number; end: number }[] }));
  session.transcript.forEach((m, i) => {
    if (!isTurn(m)) return;
    const from = i > 0 ? Date.parse(session.transcript[i - 1].at) : start;
    rows.find(r => r.agent === m.from)!.spans.push({ start: from, end: Date.parse(m.at) });
  });
  if (session.active && !ended) rows.find(r => r.agent === session.active!.agent)!.spans.push({ start: Date.parse(session.active.since), end: now });
  return { stages, tasks, summary, lanes: { start, end, rows } };
}

const TERMINAL = new Set(["done", "rejected", "stopped"]);

export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
