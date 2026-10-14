import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const commit = new URL(request.url).searchParams.get("commit") ?? "";
  return foreignHost(request) ?? forwardToRoom(`/sessions/current/diff?commit=${encodeURIComponent(commit)}`);
}
