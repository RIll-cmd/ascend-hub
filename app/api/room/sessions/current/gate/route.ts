import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/sessions/current/gate", { method: "POST", body: command.body });
}
