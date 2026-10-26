import type { QueueView } from "../queue-panel";
import { AGENT_NAMES, type AgentId, type SessionView } from "../room-types";

// The room's arrangement and what it shows, derived from the session and the queue. Pure, so the deck, the page's
// right column and the tests all read the same description.
export type RoomKind = "idle" | "coding" | "debate";
export type RoomScene = {
  kind: RoomKind;
  // Set when the owner must act: a build gate, or a pause that will not resume by itself.
  gate: { line: string } | null;
  roles: { orchestrator: AgentId | null; coders: AgentId[]; reviewer: AgentId | null };
  plan: { title: string; status: "done" | "running" | "pending" | "failed" }[];
  // The shared screen's strip, for example "Task 2/3 · Claude coding · Antigravity assigned".
  task: string | null;
  check: "running" | "pass" | "fail" | null;
  phase: "opening" | "critique" | "verdict" | null;
  speaker: AgentId | null;
  judge: AgentId | null;
  queued: number;
  upNext: string | null;
};
export type Spot = { desk: [number, number, number]; deskYaw: number };

const TERMINAL = new Set(["done", "rejected", "stopped"]);
const PANEL_STAGES = new Set(["discuss", "roles", "gate-roles"]);
const PHASES = new Set(["opening", "critique", "verdict"]);
const GATE_LINES: Record<string, string> = {
  "gate-roles": "approve the roles", "gate-plan": "approve the plan", "gate-race": "pick a race winner", "gate-result": "review the result",
};
const PLAN_STATUS = { done: "done", running: "running", review: "running", pending: "pending", skipped: "failed" } as const;

function upNextOf(queue: QueueView | null): string | null {
  if (queue?.items.length) return queue.items[0].title;
  const next = [...(queue?.schedules ?? [])].sort((a, b) => a.nextRun.localeCompare(b.nextRun))[0];
  return next ? `${next.title} · ${new Date(next.nextRun).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : null;
}

export function roomScene(session: SessionView | null, queue: QueueView | null): RoomScene {
  const base: RoomScene = {
    kind: "idle", gate: null, roles: { orchestrator: null, coders: [], reviewer: null }, plan: [], task: null, check: null,
    phase: null, speaker: null, judge: null, queued: queue?.items.length ?? 0, upNext: upNextOf(queue),
  };
  if (!session || TERMINAL.has(session.stage)) return base;
  const debate = session.mode === "debate";
  const kind: RoomKind = debate || PANEL_STAGES.has(session.stage) ? "debate" : "coding";
  const roles = session.roles ? { orchestrator: session.roles.orchestrator, coders: [...session.roles.coders], reviewer: session.roles.reviewer } : base.roles;
  const pause = session.pause;
  // A rate-limit pause with a retry time resumes by itself, so it does not ask for the owner.
  const selfRetry = pause?.kind === "rate-limit" && Boolean(pause.retryAt);
  const gate = pause && !selfRetry ? { line: "paused · retry or stop" } : GATE_LINES[session.stage] && !debate ? { line: GATE_LINES[session.stage] } : null;
  const tasks = session.plan?.tasks ?? [];
  const current = tasks.find(t => t.status === "running" || t.status === "review") ?? null;
  const check = session.checking ? "running" : current?.check ? (current.check.ok ? "pass" : "fail") : null;
  let strip: string | null = null;
  if (current) {
    const index = tasks.indexOf(current) + 1;
    const coder = `${AGENT_NAMES[current.assignee]} ${current.status === "review" ? "done" : "coding"}`;
    const reviewer = roles.reviewer ? ` · ${AGENT_NAMES[roles.reviewer]} ${session.active?.agent === roles.reviewer ? "reviewing" : "assigned"}` : "";
    strip = `Task ${index}/${tasks.length} · ${coder}${reviewer}`;
  }
  return {
    ...base, kind, gate, roles, check, task: strip,
    plan: tasks.map(t => ({ title: t.title, status: PLAN_STATUS[t.status] })),
    phase: debate && PHASES.has(session.stage) ? (session.stage as RoomScene["phase"]) : null,
    speaker: kind === "debate" ? session.active?.agent ?? null : null,
    judge: debate ? session.judge ?? null : null,
  };
}

// Where each desk stands. Idle desks stand forward of the bookcases (back wall, x -3.6 and 2.6); the workshop's
// L bench seats the orchestrator and coders on the long side and the reviewer on the return; the panel is an arc.
const IDLE: Spot[] = [{ desk: [-2.65, 0, -1.45], deskYaw: 0.18 }, { desk: [0.05, 0, -1.45], deskYaw: 0 }, { desk: [2.75, 0, -1.45], deskYaw: -0.18 }];
const PANEL: Spot[] = [{ desk: [-2.05, 0, 0.15], deskYaw: 0.55 }, { desk: [0, 0, -1.0], deskYaw: 0 }, { desk: [2.05, 0, 0.15], deskYaw: -0.55 }];
const BENCH: Spot[] = [{ desk: [-2.1, 0, -1.55], deskYaw: 0 }, { desk: [-0.35, 0, -1.55], deskYaw: 0 }, { desk: [1.75, 0, -0.2], deskYaw: -Math.PI / 2 }];

export function spots(scene: RoomScene, ids: AgentId[]): Record<AgentId, Spot> {
  const out = {} as Record<AgentId, Spot>;
  if (scene.kind !== "coding") {
    const places = scene.kind === "idle" ? IDLE : PANEL;
    ids.forEach((id, i) => { out[id] = places[i % places.length]; });
    return out;
  }
  const { orchestrator, coders, reviewer } = scene.roles;
  const order = [orchestrator, ...coders, reviewer, ...ids].filter((id, i, all): id is AgentId => Boolean(id) && all.indexOf(id) === i && ids.includes(id as AgentId));
  order.forEach((id, i) => { out[id] = BENCH[i % BENCH.length]; });
  return out;
}

// What an agent's TV shows instead of its eye, from what it is doing right now. An offline agent always shows NO SIGNAL.
export function graphicFor(id: AgentId, state: "offline" | "checking" | "idle" | "busy", scene: RoomScene): "code" | "review" | "plan" | "wave" | null {
  if (state === "offline") return null;
  const busy = state === "busy";
  if (scene.kind === "debate") return busy && scene.speaker === id ? "wave" : null;
  if (scene.kind !== "coding") return null;
  if (busy && scene.roles.coders.includes(id)) return "code";
  if (busy && scene.roles.reviewer === id) return "review";
  return scene.roles.orchestrator === id ? "plan" : null;
}
