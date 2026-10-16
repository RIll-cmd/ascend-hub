import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return foreignHost(request) ?? forwardToRoom("/role-sets");
}

// Switches role sets and their skills on or off.
export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/role-sets", { method: "POST", body: command.body });
}
