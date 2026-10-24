import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// The session history for the room's sidebar; ?q= searches it.
export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 200);
  return foreignHost(request) ?? forwardToRoom(q ? `/sessions?q=${encodeURIComponent(q)}` : "/sessions");
}

export async function POST(request: Request) {
  // Up to 12 MB of attachments, base64-encoded, ride along with a new session.
  const command = await readCommand(request, 17 * 1024 * 1024);
  if ("error" in command) return command.error;
  // Starting runs git (a new repository, or a worktree with linked dependencies) and may extract a PDF's text before it answers.
  return forwardToRoom("/sessions", { method: "POST", body: command.body, timeoutMs: 90_000 });
}
