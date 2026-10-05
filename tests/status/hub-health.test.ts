import assert from "node:assert/strict";
import { test } from "node:test";
import { createHubHealthResponse } from "../../app/status/health-runtime";

const instance = {
  launchToken: "private-launch-token",
  instanceId: "hub-boot-1",
  buildId: "test-build",
};

test("health identifies the launched Hub only to its owner", async () => {
  const unauthorized = createHubHealthResponse(null, instance);
  assert.equal(unauthorized.status, 403);
  assert.doesNotMatch(await unauthorized.text(), /private-launch-token/);

  const wrong = createHubHealthResponse("Bearer wrong-token", instance);
  assert.equal(wrong.status, 403);

  const valid = createHubHealthResponse("Bearer private-launch-token", instance);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "no-store");
  assert.deepEqual(await valid.json(), {
    schemaVersion: 1,
    component: "hub",
    instanceId: "hub-boot-1",
    buildId: "test-build",
    state: "ready",
    capabilities: { ui: "ready", core: "unknown" },
  });
});

test("an ordinary development server cannot be mistaken for an owned launch", () => {
  assert.equal(createHubHealthResponse("Bearer private-launch-token", {
    ...instance,
    instanceId: undefined,
  }).status, 503);
  assert.equal(createHubHealthResponse("Bearer private-launch-token", {
    ...instance,
    launchToken: undefined,
  }).status, 503);
});
