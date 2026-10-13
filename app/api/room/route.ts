import { forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET() {
  return forwardToRoom("/status");
}
