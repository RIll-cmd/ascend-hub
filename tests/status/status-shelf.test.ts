import assert from "node:assert/strict";
import test from "node:test";

import {
  createStatusShelfProxy,
  getPollingDelay,
  statusShelfReducer,
} from "../../app/status/shelf-runtime";
import { getStatusPresentation } from "../../components/status/status-presentation";
import {
  getShelfTvAssignment,
  resolveShelfTvService,
} from "../../components/status/shelf-tv-assignment";

const snapshot = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-17T00:00:00.000Z",
  services: [
    {
      serviceId: "ascend-core",
      instanceId: "core-local-1",
      serviceType: "agent" as const,
      state: "idle" as const,
      stateSince: "2026-09-17T00:00:00.000Z",
      lastHeartbeatAt: "2026-09-17T00:00:00.000Z",
      staleAfterSeconds: 30,
    },
  ],
};

test("proxy forwards only the server-held read credential", async () => {
  let request: Request | undefined;
  const proxy = createStatusShelfProxy({
    coreShelfUrl: "https://core.example/api/status/shelf",
    readCredential: "reader-id.reader-secret",
    fetchImpl: async (input, init) => {
      request = new Request(input, init);
      return Response.json(snapshot);
    },
  });

  const response = await proxy();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(request?.headers.get("X-Status-Read-Credential"), "reader-id.reader-secret");
  assert.equal(body, JSON.stringify(snapshot));
  assert.equal(body.includes("reader-secret"), false);
});

test("proxy fails safely when server configuration is missing", async () => {
  const response = await createStatusShelfProxy({ coreShelfUrl: undefined, readCredential: undefined })();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "status_shelf_not_configured" });
});

test("proxy sanitizes an upstream failure", async () => {
  const response = await createStatusShelfProxy({
    coreShelfUrl: "https://core.example/api/status/shelf",
    readCredential: "reader-id.reader-secret",
    fetchImpl: async () => new Response("sensitive upstream detail", { status: 502 }),
  })();

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "status_authority_unavailable" });
});

test("successful polling replaces the current and last successful snapshot", () => {
  const result = statusShelfReducer({ current: null, lastSuccessful: null, error: null, lastSuccessfulAt: null }, { type: "success", snapshot, receivedAt: 100 });

  assert.equal(result.current, snapshot);
  assert.equal(result.lastSuccessful, snapshot);
  assert.equal(result.error, null);
  assert.equal(result.lastSuccessfulAt, 100);
});

test("temporary polling failure retains the last successful snapshot and marks it stale", () => {
  const result = statusShelfReducer({ current: snapshot, lastSuccessful: snapshot, error: null, lastSuccessfulAt: 100 }, { type: "failure", error: "status_authority_unavailable" });

  assert.equal(result.current, snapshot);
  assert.equal(result.lastSuccessful, snapshot);
  assert.equal(result.error, "status_authority_unavailable");
  assert.equal(result.stale, true);
});

test("hidden-tab polling slows and visible polling resumes at four seconds", () => {
  assert.equal(getPollingDelay(false), 4_000);
  assert.equal(getPollingDelay(true), 30_000);
});

test("each normalized state has accessible non-color presentation", () => {
  for (const state of ["idle", "working", "stuck", "offline"] as const) {
    const presentation = getStatusPresentation({ ...snapshot.services[0], state });
    assert.equal(presentation.label, state[0].toUpperCase() + state.slice(1));
    assert.ok(presentation.ariaDescription.length > 0);
    assert.ok(presentation.symbol.length > 0);
  }
});

test("unknown services receive the generic TV fallback and tolerate absent optional metadata", () => {
  const presentation = getStatusPresentation({
    serviceId: "future-agent-7",
    instanceId: "future-1",
    serviceType: "bot",
    state: "working",
    stateSince: "2026-09-17T00:00:00.000Z",
    lastHeartbeatAt: "2026-09-17T00:00:00.000Z",
    staleAfterSeconds: 30,
  });

  assert.equal(presentation.brand, "Generic service");
  assert.equal(presentation.artwork, "generic");
});

test("the four first-shelf TVs are assigned to the intended services", () => {
  assert.deepEqual(getShelfTvAssignment("slot-1-1-t"), {
    channel: "CH 01",
    serviceId: "ascend-core",
  });
  assert.deepEqual(getShelfTvAssignment("slot-1-3-t"), {
    channel: "CH 02",
    serviceId: "ascend-vision",
  });
  assert.deepEqual(getShelfTvAssignment("slot-1-1-b"), {
    channel: "CH 03",
    serviceId: "codex-cli",
  });
  assert.deepEqual(getShelfTvAssignment("slot-1-3-b"), {
    channel: "CH 04",
    serviceId: "antigravity-cli",
  });
  assert.equal(getShelfTvAssignment("slot-2-1-m"), null);
});

test("a shelf TV resolves only its assigned service from a shared snapshot", () => {
  const services = [
    snapshot.services[0],
    { ...snapshot.services[0], serviceId: "ascend-vision", instanceId: "vision-local-1" },
    { ...snapshot.services[0], serviceId: "codex-cli", instanceId: "codex-local-1" },
  ];

  assert.equal(resolveShelfTvService("slot-1-1-t", services)?.instanceId, "core-local-1");
  assert.equal(resolveShelfTvService("slot-1-1-b", services)?.instanceId, "codex-local-1");
  assert.equal(resolveShelfTvService("slot-1-3-b", services), null);
});

test("CLI shelf TVs use explicit service names instead of the generic fallback", () => {
  const codex = getStatusPresentation({
    ...snapshot.services[0],
    serviceId: "codex-cli",
    instanceId: "codex-local-1",
  });
  const antigravity = getStatusPresentation({
    ...snapshot.services[0],
    serviceId: "antigravity-cli",
    instanceId: "antigravity-local-1",
  });

  assert.equal(codex.brand, "Codex CLI");
  assert.equal(antigravity.brand, "Antigravity CLI");
});
