import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The sessions waiting to start, the ones that could not, and the schedules.
export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/queue");
}

// Adds a start body to the queue; it starts as soon as no session runs.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/queue", { method: "POST", body: command.body, timeoutMs: 30_000 });
}
