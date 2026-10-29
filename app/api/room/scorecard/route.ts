import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The room checks days (7, 30 or all); Hub only passes the query on.
export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom(`/scorecard${new URL(request.url).search}`);
}
