import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The live session's uncommitted changes, polled by the Changes tab.
export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/sessions/current/live-diff", { timeoutMs: 15_000 });
}
