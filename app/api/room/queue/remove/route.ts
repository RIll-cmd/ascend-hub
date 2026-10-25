import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// Removes a queued session, a failed one or a schedule by id.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/queue/remove", { method: "POST", body: command.body });
}
