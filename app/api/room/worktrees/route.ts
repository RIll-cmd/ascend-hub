import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/worktrees");
}

// Removes stopped sessions' worktrees; their branches stay in the repo.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/worktrees/clean", { method: "POST", body: {} });
}
