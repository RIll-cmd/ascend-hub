import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  // Posting runs gh against GitHub, which can take a while.
  return forwardToRoom("/sessions/current/post-review", { method: "POST", body: command.body, timeoutMs: 60_000 });
}
