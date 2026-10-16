import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The session history for the room's sidebar.
export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/sessions");
}

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/sessions", { method: "POST", body: command.body });
}
