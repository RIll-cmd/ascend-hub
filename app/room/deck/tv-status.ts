import type { AgentId } from "../room-types";
import type { RoomScene } from "./room-scene";

// The shelf's status style on the room's TVs: a channel bug, a mascot whose face shows the mood, and a news lower
// third (headline banner over a line of detail). Pure, so the deck and the tests read the same words.
export type TvMood = "working" | "reviewing" | "idle" | "stuck" | "offline";
export type TvStatus = { channel: string; bug: "LIVE" | "WAIT" | "IDLE" | "OFF"; mood: TvMood; headline: string; sub: string; banner: string };
export type TvAgent = {
  id: AgentId; name: string; color: string; state: "offline" | "checking" | "idle" | "busy";
  activity: string | null; since: string | null; roles: string[];
};
type Graphic = "code" | "review" | "plan" | "wave" | null;

// Continues the shelf's numbering (CH 03 Codex, CH 04 Antigravity); Claude has no shelf TV, so it takes the next one.
const CHANNELS: Record<AgentId, string> = { codex: "CH 03", agy: "CH 04", claude: "CH 05" };
const VERBS: Record<Exclude<Graphic, null>, string> = { code: "CODING", review: "REVIEWING", plan: "PLANNING", wave: "SPEAKING" };
const GREY = "#5f5e5a";
const AMBER = "#ba7517";

function age(since: string | null, nowMs: number): string | null {
  const start = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(start)) return null;
  const minutes = Math.floor((nowMs - start) / 60_000);
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function taskLine(scene: RoomScene, pick: (t: RoomScene["plan"][number]) => boolean): string | null {
  const index = scene.plan.findIndex(t => t.status === "running" && pick(t));
  return index < 0 ? null : `task ${index + 1}/${scene.plan.length} · ${scene.plan[index].title}`;
}

export function tvStatus(agent: TvAgent, scene: RoomScene, graphic: Graphic, nowMs: number): TvStatus {
  const name = agent.name.toUpperCase();
  const channel = CHANNELS[agent.id];
  if (agent.state === "offline") return { channel, bug: "OFF", mood: "offline", headline: `${name} · OFFLINE`, sub: "CLI not available", banner: GREY };
  // A gate is the orchestrator's to raise; before roles exist every TV asks.
  const holder = scene.roles.orchestrator ?? scene.roles.coders[0] ?? null;
  if (scene.gate && (holder === null || holder === agent.id)) {
    return { channel, bug: "WAIT", mood: "stuck", headline: `${name} · NEEDS YOU`, sub: scene.gate.line, banner: AMBER };
  }
  if (agent.state === "checking") return { channel, bug: "IDLE", mood: "idle", headline: `${name} · CHECKING`, sub: "looking for its CLI", banner: GREY };
  if (agent.state === "idle") {
    return { channel, bug: "IDLE", mood: "idle", headline: `${name} · IDLE`, sub: agent.roles.join(" · ") || "ready", banner: GREY };
  }
  const what = graphic === "code" ? taskLine(scene, t => t.assignee === agent.id)
    : graphic === "review" ? taskLine(scene, t => t.assignee !== agent.id)
      : graphic === "wave" ? scene.phase : null;
  const sub = [what ?? agent.activity ?? "working", age(agent.since, nowMs)].filter(Boolean).join(" · ");
  return { channel, bug: "LIVE", mood: graphic === "review" ? "reviewing" : "working", headline: `${name} · ${graphic ? VERBS[graphic] : "WORKING"}`, sub, banner: agent.color };
}
