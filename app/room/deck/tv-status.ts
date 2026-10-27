import type { AgentId } from "../room-types";
import type { RoomScene } from "./room-scene";
import * as words from "../../../scripts/agent-room/tv-words.mjs";

// The shelf's status style on the room's TVs: a channel bug, a mascot whose face shows the mood, and a news lower
// third (headline banner over a line of detail). Pure, so the deck and the tests read the same words.
export type TvMood = "working" | "reviewing" | "idle" | "stuck" | "offline";
export type TvStatus = { channel: string; bug: "LIVE" | "WAIT" | "IDLE" | "OFF"; mood: TvMood; headline: string; sub: string; banner: string };
export type TvAgent = {
  id: AgentId; name: string; color: string; state: "offline" | "checking" | "idle" | "busy";
  activity: string | null; since: string | null; roles: string[];
};
type Graphic = "code" | "review" | "plan" | "wave" | null;

// The words themselves live in scripts/agent-room/tv-words.mjs, which the agent room reads too.
export const tvStatus: (agent: TvAgent, scene: RoomScene, graphic: Graphic, nowMs: number) => TvStatus = words.tvStatus as never;

