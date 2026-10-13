import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { forwardToRoom, readCommand, readServerInfo } from "../../app/room/room-proxy";

function dataDirWith(info: unknown) {
  const dir = join(mkdtempSync(join(tmpdir(), "ascend-room-proxy-")), "agent-room");
  mkdirSync(dir, { recursive: true });
  if (info !== undefined) writeFileSync(join(dir, "server.json"), JSON.stringify(info));
  return dir;
}

test("offline when server.json is missing, malformed, or the port is dead", async () => {
  assert.equal(readServerInfo(dataDirWith(undefined)), null);
  assert.equal(readServerInfo(dataDirWith({ port: "x", token: 1 })), null);
  const res = await forwardToRoom("/status", {}, dataDirWith({ port: 1, token: "t", pid: 1 }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { online: false });
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
  const res = await forwardToRoom("/sessions", { method: "POST", body: { project: "p" } }, dataDirWith({ port, token: "secret", pid: 1 }));
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
  const big = await readCommand(req(JSON.stringify({ t: "x".repeat(17_000) })));
  assert.ok("error" in big && big.error.status === 413);
  const arr = await readCommand(req("[1]"));
  assert.ok("error" in arr && arr.error.status === 400);
});
