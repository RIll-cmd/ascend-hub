import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// Sends one plain phone push through the room's ntfy setting (used by Vision).
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/notify", { method: "POST", body: command.body });
}
