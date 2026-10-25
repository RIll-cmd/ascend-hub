import { foreignHost, forwardFileFromRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// Every produced file in one zip, built by git in the room.
export function GET(request: Request) {
  const id = new URL(request.url).pathname.split("/").at(-3) ?? "";
  if (!/^\d+-[0-9a-f]{6}$/.test(id)) return Response.json({ error: "SESSION_ID_INVALID" }, { status: 400 });
  return foreignHost(request) ?? forwardFileFromRoom(`/sessions/${id}/produced/zip`, 120_000);
}
