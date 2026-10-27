import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// A Hub page's heartbeat: the proxy marks it as a viewer, so the desktop launcher keeps Hub running while a page is open.
export function POST(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/viewer", { method: "POST" });
}
