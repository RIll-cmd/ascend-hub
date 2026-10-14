import { foreignHost, forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  return foreignHost(request) ?? forwardToRoom(`/memory?key=${encodeURIComponent(key)}`);
}

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/memory", { method: "POST", body: command.body });
}
