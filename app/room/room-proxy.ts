type RoomConnection = { port: number; token: string };

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" };

// Route handlers run in workerd: no child_process and no real disk, only .env.local via process.env.
export function roomConnection(env: Record<string, string | undefined> = process.env): RoomConnection | null {
  const token = env.ASCEND_ROOM_TOKEN;
  if (!token) return null;
  return { port: Number(env.ASCEND_ROOM_PORT ?? 5181), token };
}

export async function forwardToRoom(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}, conn = roomConnection()): Promise<Response> {
  if (!conn) return Response.json({ online: false, reason: "ASCEND_ROOM_TOKEN is not set in .env.local" }, { status: 503, headers: NO_STORE });
  try {
    const res = await fetch(`http://127.0.0.1:${conn.port}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${conn.token}`, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 5000),
      cache: "no-store",
    });
    return new Response(await res.text(), { status: res.status, headers: NO_STORE });
  } catch {
    return Response.json({ online: false }, { status: 503, headers: NO_STORE });
  }
}

// The room drives agents that run commands. The production server has no Host check, so a DNS-rebound
// hostname would pass the origin check; only loopback hostnames may reach it.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
export function foreignHost(request: Request): Response | null {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOOPBACK_HOSTS.has(name.toLowerCase()) ? null : Response.json({ error: "HOST_NOT_ALLOWED" }, { status: 403 });
}

export async function readCommand(request: Request, maxChars = 65_536): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  const foreign = foreignHost(request);
  if (foreign) return { error: foreign };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { error: Response.json({ error: "ORIGIN_MISMATCH" }, { status: 403 }) };
  const text = await request.text();
  if (text.length > maxChars) return { error: Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 }) };
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return { body };
  } catch {}
  return { error: Response.json({ error: "BODY_INVALID" }, { status: 400 }) };
}
