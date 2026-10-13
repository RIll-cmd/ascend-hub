import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ServerInfo = { port: number; token: string; pid: number };

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" };

export function roomDataDir(cwd = process.cwd()) {
  return join(cwd, ".sites-runtime", "agent-room");
}

export function readServerInfo(dir = roomDataDir()): ServerInfo | null {
  try {
    const info = JSON.parse(readFileSync(join(dir, "server.json"), "utf8"));
    return Number.isInteger(info.port) && typeof info.token === "string" ? info : null;
  } catch {
    return null;
  }
}

export async function forwardToRoom(path: string, init: { method?: string; body?: unknown } = {}, dir?: string): Promise<Response> {
  const info = readServerInfo(dir);
  if (!info) return Response.json({ online: false }, { status: 503, headers: NO_STORE });
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return new Response(await res.text(), { status: res.status, headers: NO_STORE });
  } catch {
    return Response.json({ online: false }, { status: 503, headers: NO_STORE });
  }
}

export async function readCommand(request: Request): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { error: Response.json({ error: "ORIGIN_MISMATCH" }, { status: 403 }) };
  const text = await request.text();
  if (text.length > 16_384) return { error: Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 }) };
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return { body };
  } catch {}
  return { error: Response.json({ error: "BODY_INVALID" }, { status: 400 }) };
}

export async function startRoomServer(cwd = process.cwd()): Promise<Response> {
  const status = await forwardToRoom("/status", {}, roomDataDir(cwd));
  if (status.ok) return Response.json({ started: false });
  const child = spawn(process.execPath, [join(cwd, "scripts", "agent-room", "server.mjs")], {
    cwd, detached: true, stdio: "ignore", windowsHide: true,
  });
  child.unref();
  return Response.json({ started: true }, { status: 202 });
}
