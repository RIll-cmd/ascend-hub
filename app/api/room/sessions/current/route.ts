import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/sessions/current");
}
