import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  // Stopping waits for the running agent turn to end.
  return forwardToRoom("/sessions/current/stop", { method: "POST", body: command.body, timeoutMs: 30_000 });
}
