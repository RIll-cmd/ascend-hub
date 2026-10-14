import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/quota");
}

// Refresh re-reads Codex's log and, at most once a minute, runs a tiny Claude probe, so it can take up to the probe's 2-minute timeout.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/quota/refresh", { method: "POST", body: {}, timeoutMs: 150_000 });
}
