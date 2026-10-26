import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["fetch", "install", "discard", "remove", "save"]);

// fetch stages a skill from GitHub (slow, so a long timeout); install, discard and remove act on the library;
// save keeps a skill the agents proposed at a result gate.
export async function POST(request: Request) {
  const action = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!ACTIONS.has(action)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom(`/skills/${action}`, { method: "POST", body: command.body, timeoutMs: action === "fetch" ? 120_000 : 5000 });
}
