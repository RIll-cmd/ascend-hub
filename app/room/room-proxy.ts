type RoomConnection = { port: number; token: string };

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" };

// Route handlers run in workerd: no child_process and no real disk, only .env.local via process.env.
export function roomConnection(env: Record<string, string | undefined> = process.env): RoomConnection | null {
  const token = env.ASCEND_ROOM_TOKEN;
  if (!token) return null;
  return { port: Number(env.ASCEND_ROOM_PORT ?? 5181), token };
}

export async function forwardToRoom(path: string, init: { method?: string; body?: unknown } = {}, conn = roomConnection()): Promise<Response> {
  if (!conn) return Response.json({ online: false, reason: "ASCEND_ROOM_TOKEN is not set in .env.local" }, { status: 503, headers: NO_STORE });
  try {
    const res = await fetch(`http://127.0.0.1:${conn.port}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${conn.token}`, "content-type": "application/json" },
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
  if (text.length > 65_536) return { error: Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 }) };
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return { body };
  } catch {}
  return { error: Response.json({ error: "BODY_INVALID" }, { status: 400 }) };
}
