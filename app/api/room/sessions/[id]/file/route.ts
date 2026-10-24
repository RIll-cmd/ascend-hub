import { foreignHost, forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// One listed file, read-only; the room only opens paths from its own list.
export function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.pathname.split("/").at(-2) ?? "";
  const path = url.searchParams.get("path") ?? "";
  if (!/^\d+-[0-9a-f]{6}$/.test(id) || !path || path.length > 1000) return Response.json({ error: "FILE_INVALID" }, { status: 400 });
  return foreignHost(request) ?? forwardToRoom(`/sessions/${id}/file?path=${encodeURIComponent(path)}`, { timeoutMs: 15_000 });
}
