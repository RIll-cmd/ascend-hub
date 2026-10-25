import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

// Schedules a session: once, daily or on weekdays, from a first run time.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/schedules", { method: "POST", body: command.body });
}
