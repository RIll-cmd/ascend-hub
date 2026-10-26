import { foreignHost, forwardFileFromRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The live screen's latest capture (a PNG) while an agent edits a UI task; shown on its CRT.
export function GET(request: Request) {
  return foreignHost(request) ?? forwardFileFromRoom("/sessions/current/screen", 15_000);
}
