import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// One check run's full output; the room checks the id and number too.
export function GET(request: Request) {
  const [id = "", , n = ""] = new URL(request.url).pathname.split("/").slice(-3);
  if (!/^\d+-[0-9a-f]{6}$/.test(id) || !/^\d{1,6}$/.test(n)) return Response.json({ error: "CHECK_RUN_INVALID" }, { status: 400 });
  return foreignHost(request) ?? forwardToRoom(`/sessions/${id}/checks/${n}`, { timeoutMs: 15_000 });
}
