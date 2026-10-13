"use client";
import type { SessionView } from "./room-types";
export function DebateView({ session }: { session: SessionView }) {
  return <div className="agent-room-debate"><h2>{session.task}</h2></div>;
}
