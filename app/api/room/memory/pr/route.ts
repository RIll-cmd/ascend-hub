import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// Pushes a branch and runs gh pr create, so it gets a long timeout; the page confirms with the owner first.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/memory/pr", { method: "POST", body: command.body, timeoutMs: 120_000 });
}
