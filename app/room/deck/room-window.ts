import type { AgentId, RoomStatus, SessionView } from "../room-types";
import { deckView } from "./deck-view";
import { graphicFor } from "./room-scene";
import { tvStatus, type TvMood, type TvStatus } from "./tv-status";

// The home page's window into the Agent Room: three little TVs and one headline, in the same words the room's
// TVs use. The TV that needs you leads, then one at work; otherwise the window counts who is ready.
export type RoomWindow = { bug: TvStatus["bug"]; headline: string; sub: string; banner: string; tvs: { id: AgentId; color: string; mood: TvMood }[] };

const GREY = "#5f5e5a";

export function roomWindow(status: RoomStatus | null, session: SessionView | null, nowMs: number): RoomWindow {
  const view = deckView(session, status);
  const tvs = view.agents.map(agent => ({ agent, s: tvStatus(agent, view.room, graphicFor(agent.id, agent.state, view.room), nowMs) }));
  const out = tvs.map(({ agent, s }) => ({ id: agent.id, color: agent.color, mood: status ? s.mood : "offline" as TvMood }));
  if (!status) return { bug: "OFF", headline: "ROOM CLOSED", sub: "the room process is not running", banner: GREY, tvs: out };
  const lead = tvs.find(t => t.s.bug === "WAIT") ?? tvs.find(t => t.s.bug === "LIVE");
  if (lead) return { bug: lead.s.bug, headline: lead.s.headline, sub: lead.s.sub, banner: lead.s.banner, tvs: out };
  const readyCount = view.agents.filter(a => a.state !== "offline" && a.state !== "checking").length;
  return { bug: "IDLE", headline: "ALL QUIET", sub: `${readyCount} of ${view.agents.length} agents ready`, banner: GREY, tvs: out };
}
