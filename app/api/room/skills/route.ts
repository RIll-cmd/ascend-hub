import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The skill library, or one skill's SKILL.md with ?id=.
export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return foreignHost(request) ?? forwardToRoom(id === null ? "/skills" : `/skills/view?id=${encodeURIComponent(id)}`);
}
