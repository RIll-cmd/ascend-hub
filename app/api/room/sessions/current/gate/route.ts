import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  // A merge or pull request pushes and runs gh, which can take well over the default 5 seconds.
  return forwardToRoom("/sessions/current/gate", { method: "POST", body: command.body, timeoutMs: 120_000 });
}
