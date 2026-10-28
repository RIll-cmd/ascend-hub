import type { ServiceState, ShelfServiceStatus } from "../../app/status/shelf-contract";
import type { AgentId, RoomStatus, SessionView } from "../../app/room/room-types";
import { deckView } from "../../app/room/deck/deck-view";
import { graphicFor } from "../../app/room/deck/room-scene";
import { tvStatus } from "../../app/room/deck/tv-status";

const SERVICE_IDS: Record<AgentId, string> = { claude: "claude-cli", codex: "codex-cli", agy: "antigravity-cli" };

// The home page polls the room every 5 s (30 s hidden); a report older than this means the poll stopped.
const STALE_AFTER_SECONDS = 60;

// The agent room's TVs as shelf status reports, so the shelf's agent TVs show what the room's TVs show.
// fetchedAt is when /api/room answered; nowMs is the shelf clock, which may tick just behind it.
export function roomShelfServices(status: RoomStatus | null, session: SessionView | null, fetchedAt: number, nowMs: number): ShelfServiceStatus[] {
  if (!status) return [];
  const view = deckView(session, status);
  const heartbeat = new Date(Math.min(fetchedAt, nowMs)).toISOString();
  return view.agents.map(agent => {
    const tv = tvStatus(agent, view.room, graphicFor(agent.id, agent.state, view.room), nowMs);
    const state: ServiceState = tv.mood === "offline" ? "offline" : tv.mood === "stuck" ? "stuck" : tv.bug === "LIVE" ? "working" : "idle";
    return {
      serviceId: SERVICE_IDS[agent.id], instanceId: "agent-room", serviceType: "agent", state,
      stateSince: agent.since ?? heartbeat, lastHeartbeatAt: heartbeat, staleAfterSeconds: STALE_AFTER_SECONDS,
      activity: state === "working" ? { kind: "room", label: tv.sub, startedAt: agent.since ?? undefined } : null,
      issue: state === "stuck" ? { code: "needs-you", message: tv.sub } : null,
    };
  });
}
