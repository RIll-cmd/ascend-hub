import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The files git knows in a build session's folder; the room checks the id too.
export function GET(request: Request) {
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  if (!/^\d+-[0-9a-f]{6}$/.test(id)) return Response.json({ error: "SESSION_ID_INVALID" }, { status: 400 });
  return foreignHost(request) ?? forwardToRoom(`/sessions/${id}/files`, { timeoutMs: 15_000 });
}
