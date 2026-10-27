import type { QueueView } from "../queue-panel";
import type { AgentId, SessionView } from "../room-types";
import * as words from "../../../scripts/agent-room/tv-words.mjs";

// The room's arrangement and what it shows, derived from the session and the queue. Pure, so the deck, the page's
// right column and the tests all read the same description.
export type RoomKind = "idle" | "coding" | "debate";
export type RoomScene = {
  kind: RoomKind;
  // Set when the owner must act: a build gate, or a pause that will not resume by itself.
  gate: { line: string } | null;
  roles: { orchestrator: AgentId | null; coders: AgentId[]; reviewer: AgentId | null };
  plan: { title: string; status: "done" | "running" | "pending" | "failed"; assignee: AgentId }[];
  // The shared screen's strip, for example "Task 2/3 · Claude coding · Antigravity assigned".
  task: string | null;
  check: "running" | "pass" | "fail" | null;
  phase: "opening" | "critique" | "verdict" | null;
  speaker: AgentId | null;
  judge: AgentId | null;
  queued: number;
  upNext: string | null;
  // Coders whose task is running (every racing coder in a race), and whoever is in a review turn right now.
  working: AgentId[];
  reviewing: AgentId | null;
};
export type Spot = { desk: [number, number, number]; deskYaw: number };

// The arrangement itself lives in scripts/agent-room/tv-words.mjs, which the agent room reads too.
export const roomScene: (session: SessionView | null, queue: QueueView | null) => RoomScene = words.roomScene as never;
const reviewerAtWork: (session: SessionView) => AgentId | null = words.reviewerAtWork as never;

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
  // The reviewer takes the return unless it also plans or codes; everyone else fills the long side first.
  const aside = reviewer && reviewer !== orchestrator && !coders.includes(reviewer) && ids.includes(reviewer) ? reviewer : null;
  const order = [orchestrator, ...coders, ...ids].filter((id, i, all): id is AgentId => Boolean(id) && all.indexOf(id) === i && ids.includes(id as AgentId) && id !== aside);
  const long = aside ? order.slice(0, 2) : order;
  long.forEach((id, i) => { out[id] = BENCH[i % BENCH.length]; });
  if (aside) {
    out[aside] = BENCH[2];
    order.slice(2).forEach(id => { out[id] = BENCH[1]; });
  }
  return out;
}

// What an agent's TV shows instead of its eye, from what it is doing right now. An offline agent always shows NO SIGNAL.
export const graphicFor: (id: AgentId, state: "offline" | "checking" | "idle" | "busy", scene: RoomScene) => "code" | "review" | "plan" | "wave" | null = words.graphicFor as never;

export type NowCard = {
  task: string;
  coder: AgentId | null;
  since: string | null;
  // The shown task's own checks: an earlier task's pass stays on that task's plan line.
  checks: "not run yet" | "running" | "passed" | "failed";
  reviewer: { agent: AgentId; state: "assigned, waiting" | "reviewing" } | null;
};

// The right column's Now card while the room is a workshop; null in the other rooms.
export function nowCard(session: SessionView | null): NowCard | null {
  if (!session || roomScene(session, null).kind !== "coding") return null;
  const tasks = session.plan?.tasks ?? [];
  const current = tasks.find(t => t.status === "running" || t.status === "review") ?? null;
  const reviewer = session.roles?.reviewer ?? null;
  return {
    task: current ? `Task ${tasks.indexOf(current) + 1}/${tasks.length} · ${current.title}` : tasks.length ? `Plan · ${tasks.length} tasks` : "Planning",
    coder: current?.assignee ?? null,
    since: current && session.active?.agent === current.assignee ? session.active.since : null,
    checks: session.checking ? "running" : current?.check ? (current.check.ok ? "passed" : "failed") : "not run yet",
    reviewer: reviewer ? { agent: reviewer, state: reviewerAtWork(session) === reviewer ? "reviewing" : "assigned, waiting" } : null,
  };
}
