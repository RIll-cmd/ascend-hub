import { BUILD_STEPS, DEBATE_STEPS, stepStates } from "./deck/deck-view";
import type { AgentId, Message, PlanTask, SessionView } from "./room-types";

export type WorkflowStage = { label: string; state: "done" | "current" | "todo"; ms: number | null };
export type WorkflowTask = {
  id: number; title: string; assignee: AgentId; status: PlanTask["status"]; commit: string | null; notes: string;
  rounds: number; reviews: number; ms: number | null; messages: Message[];
};
export type WorkflowView = { stages: WorkflowStage[]; tasks: WorkflowTask[] };

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
    return {
      id: task.id, title: task.title, assignee: task.assignee, status: task.status, commit: task.commit, notes: task.notes,
      rounds: messages.filter(m => m.kind === "assign").length,
      reviews: session.roles?.reviewer ? messages.filter(m => m.from === session.roles!.reviewer).length : 0,
      ms: start !== undefined && end !== undefined ? end - start : null,
      messages,
    };
  });
  return { stages, tasks };
}

const TERMINAL = new Set(["done", "rejected", "stopped"]);

export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
