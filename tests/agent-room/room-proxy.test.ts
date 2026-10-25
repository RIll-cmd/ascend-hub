import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { foreignHost, forwardFileFromRoom, forwardToRoom, readCommand, roomConnection } from "../../app/room/room-proxy";

test("connection comes from the .env.local values workerd exposes", () => {
  assert.equal(roomConnection({}), null);
  assert.deepEqual(roomConnection({ ASCEND_ROOM_TOKEN: "t" }), { port: 5181, token: "t" });
  assert.deepEqual(roomConnection({ ASCEND_ROOM_TOKEN: "t", ASCEND_ROOM_PORT: "6000" }), { port: 6000, token: "t" });
});

test("offline when there is no token or the port is dead", async () => {
  const missing = await forwardToRoom("/status", {}, null);
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { online: false, reason: "ASCEND_ROOM_TOKEN is not set in .env.local" });
  const dead = await forwardToRoom("/status", {}, { port: 1, token: "t" });
  assert.equal(dead.status, 503);
  assert.deepEqual(await dead.json(), { online: false });
});

test("forwards method, body and bearer token, and passes status through", async () => {
  const seen: { auth?: string; method?: string; body?: string; url?: string } = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      Object.assign(seen, { auth: req.headers.authorization, method: req.method, body, url: req.url });
      res.writeHead(409, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "SESSION_ACTIVE" }));
    });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const res = await forwardToRoom("/sessions", { method: "POST", body: { project: "p" } }, { port, token: "secret" });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "SESSION_ACTIVE" });
  assert.deepEqual(seen, { auth: "Bearer secret", method: "POST", body: '{"project":"p"}', url: "/sessions" });
  server.close();
});

test("readCommand enforces same origin, size and object shape", async () => {
  const req = (body: string, origin = "http://localhost:5173") =>
    new Request("http://localhost:5173/api/room/sessions", { method: "POST", headers: { origin }, body });
  assert.deepEqual(await readCommand(req('{"a":1}')), { body: { a: 1 } });
  assert.deepEqual(await readCommand(req("")), { body: {} });
  const cross = await readCommand(req("{}", "http://evil.test"));
  assert.ok("error" in cross && cross.error.status === 403);
  // A full plan (20 tasks x 2,000-char descriptions) must fit; the room itself caps at 64 KB.
  const plan = await readCommand(req(JSON.stringify({ t: "x".repeat(45_000) })));
  assert.ok("body" in plan);
  const big = await readCommand(req(JSON.stringify({ t: "x".repeat(70_000) })));
  assert.ok("error" in big && big.error.status === 413);
  const arr = await readCommand(req("[1]"));
  assert.ok("error" in arr && arr.error.status === 400);
});

test("a rebound hostname cannot reach the room even with a matching origin", async () => {
  const rebound = new Request("http://evil.example:5173/api/room/sessions", {
    method: "POST", headers: { host: "evil.example:5173", origin: "http://evil.example:5173" }, body: "{}",
  });
  assert.equal(foreignHost(rebound)?.status, 403);
  const command = await readCommand(rebound);
  assert.ok("error" in command && command.error.status === 403);
  for (const host of ["127.0.0.1:5173", "localhost:5173", "[::1]:5173", "localhost"]) {
    assert.equal(foreignHost(new Request(`http://${host}/api/room`, { headers: { host } })), null, host);
  }
});

test("downloads pass through as bytes with their type and file name", async () => {
  const bytes = Buffer.from([0, 255, 13, 10, 0x80, 1]);
  const server = createServer((req, res) => {
    if (req.headers.authorization !== "Bearer secret") { res.writeHead(401); res.end(); return; }
    res.writeHead(200, { "content-type": "application/zip", "content-disposition": "attachment; filename=\"a.zip\"" });
    res.end(bytes);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const res = await forwardFileFromRoom("/sessions/x/produced/zip", 5000, { port, token: "secret" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/zip");
  assert.equal(res.headers.get("content-disposition"), "attachment; filename=\"a.zip\"");
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(bytes), "binary bytes survive the proxy");
  assert.equal((await forwardFileFromRoom("/x", 5000, null)).status, 503);
  server.close();
});
