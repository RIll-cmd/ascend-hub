"use client";
import { Badge } from "@/components/neo/badge";
import type { RoomScene } from "./deck/room-scene";
import { nowCard } from "./deck/room-scene";
import { SideSection } from "./room-parts";
import { AGENT_NAMES, type SessionView } from "./room-types";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// The workshop's right-column card: what is being built now, by whom, its own checks, and the reviewer's state.
// When the room needs the owner, the approval line leads; the buttons stay in the gate bar under the room.
export function NowCard({ session, room }: { session: SessionView; room: RoomScene }) {
  const card = nowCard(session);
  if (!card) return null;
  return (
    <SideSection title="Now" value={room.gate ? "needs you" : card.checks === "running" ? "checks running" : card.coder ? `${AGENT_NAMES[card.coder]} working` : ""} open force>
      <div className="agent-room-now">
        {room.gate && <p className="agent-room-now-gate" role="status"><b>NEEDS YOU</b> {room.gate.line}</p>}
        <p className="agent-room-now-task">{card.task}</p>
        {card.coder && <p>{AGENT_NAMES[card.coder]} {card.since ? `editing since ${clock(card.since)}` : "is assigned"}</p>}
        <p>Checks <Badge variant="neutral" className={`agent-room-now-check is-${card.checks.replace(/\s+/g, "-")}`}>{card.checks}</Badge></p>
        {card.reviewer && <p>Review: {AGENT_NAMES[card.reviewer.agent]} <Badge variant="neutral">{card.reviewer.state}</Badge></p>}
      </div>
    </SideSection>
  );
}
