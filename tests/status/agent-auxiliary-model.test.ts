import assert from "node:assert/strict";
import test from "node:test";
import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import { buildAgentAuxiliaryModel } from "../../components/status/agent-auxiliary-model";

const NOW = Date.parse("2026-09-22T02:00:00.000Z");

const workingService: ShelfServiceStatus = {
  serviceId: "codex-cli",
  instanceId: "codex-local-1",
  serviceType: "agent",
  state: "working",
  stateSince: "2026-09-22T01:58:00.000Z",
  lastHeartbeatAt: "2026-09-22T01:59:52.000Z",
  staleAfterSeconds: 30,
};

test("builds a working console model from allowlisted lifecycle fields", () => {
  const model = buildAgentAuxiliaryModel({
    assignment: { channel: "CH 03", serviceId: "codex-cli" },
    service: {
      ...workingService,
      activity: {
        kind: "agent-turn",
        label: "Generating\nanswer",
        startedAt: "2026-09-22T01:58:30.000Z",
        progress: 42,
      },
      provider: { secret: "DO-NOT-RENDER" },
      capabilities: { prompt: "DO-NOT-RENDER" },
      metadata: { transcript: "DO-NOT-RENDER" },
    },
    loading: false,
    error: null,
    stale: false,
    nowMs: NOW,
  });

  assert.equal(model.headingId, "agent-console-codex-cli");
  assert.equal(model.serviceLabel, "CODEX CLI");
  assert.equal(model.stateLabel, "WORKING");
  assert.equal(model.stateSymbol, "▶");
  assert.equal(model.detail, "Generating answer");
  assert.equal(model.signalLabel, "LIVE");
  assert.deepEqual(model.signals, [
    { label: "STATE SINCE", value: "2M AGO", tone: "normal" },
    { label: "LAST HEARTBEAT", value: "8S AGO", tone: "positive" },
    { label: "ACTIVITY", value: "1M AGO", tone: "normal" },
    { label: "PROGRESS", value: "42%", tone: "positive" },
    { label: "INSTANCE", value: "codex-local-1", tone: "muted" },
  ]);
  assert.match(model.copyText, /STATE: WORKING/);
  assert.match(model.copyText, /DETAIL: Generating answer/);
  assert.equal(JSON.stringify(model).includes("DO-NOT-RENDER"), false);
});

test("uses truthful state-specific details and clamps progress", () => {
  const stuck = buildAgentAuxiliaryModel({
    assignment: { channel: "CH 04", serviceId: "antigravity-cli" },
    service: {
      ...workingService,
      serviceId: "antigravity-cli",
      state: "stuck",
      issue: { code: "WAITING", message: "Needs\tattention", retryable: true },
      activity: { kind: "blocked", progress: 180 },
    },
    loading: false,
    error: null,
    stale: false,
    nowMs: NOW,
  });

  assert.equal(stuck.serviceLabel, "ANTIGRAVITY CLI");
  assert.equal(stuck.stateLabel, "STUCK");
  assert.equal(stuck.detail, "Needs attention");
  assert.ok(stuck.signals.some(signal => signal.label === "PROGRESS" && signal.value === "100%"));
  assert.ok(stuck.signals.some(signal => signal.label === "RETRY" && signal.value === "AVAILABLE"));

  const offline = buildAgentAuxiliaryModel({
    assignment: { channel: "CH 02", serviceId: "ascend-vision" },
    service: { ...workingService, serviceId: "ascend-vision", state: "offline" },
    loading: false,
    error: null,
    stale: false,
    nowMs: NOW,
  });

  assert.equal(offline.stateLabel, "OFFLINE");
  assert.equal(offline.detail, "LAST CONTACT 8S AGO");
});

test("sanitizes upstream scalar text and handles invalid timestamps", () => {
  const model = buildAgentAuxiliaryModel({
    assignment: { channel: "CH 01", serviceId: "ascend-core" },
    service: {
      ...workingService,
      serviceId: "ascend-core",
      instanceId: `core\n${"x".repeat(100)}`,
      stateSince: "invalid",
      lastHeartbeatAt: "invalid",
      activity: { kind: `${"activity".repeat(30)}\nsecret`, progress: -20 },
    },
    loading: false,
    error: null,
    stale: true,
    nowMs: NOW,
  });

  assert.equal(model.signalLabel, "STALE");
  assert.equal(model.detail.length <= 80, true);
  assert.equal(model.detail.includes("\n"), false);
  assert.ok(model.signals.some(signal => signal.label === "STATE SINCE" && signal.value === "UNKNOWN"));
  assert.ok(model.signals.some(signal => signal.label === "LAST HEARTBEAT" && signal.value === "UNKNOWN"));
  assert.ok(model.signals.some(signal => signal.label === "PROGRESS" && signal.value === "0%"));
  assert.ok(model.signals.some(signal => signal.label === "INSTANCE" && signal.value.length <= 48));
});

test("reports loading, unavailable, and missing-service states without exposing raw errors", () => {
  const assignment = { channel: "CH 01", serviceId: "ascend-core" } as const;

  const loading = buildAgentAuxiliaryModel({ assignment, service: null, loading: true, error: null, stale: false, nowMs: NOW });
  assert.equal(loading.signalLabel, "CONNECTING");
  assert.equal(loading.detail, "OPENING STATUS CHANNEL");

  const unavailable = buildAgentAuxiliaryModel({
    assignment,
    service: null,
    loading: false,
    error: "credential super-secret failed",
    stale: false,
    nowMs: NOW,
  });
  assert.equal(unavailable.signalLabel, "NO SIGNAL");
  assert.equal(unavailable.detail, "STATUS AUTHORITY UNAVAILABLE");
  assert.equal(unavailable.copyText.includes("super-secret"), false);

  const missing = buildAgentAuxiliaryModel({ assignment, service: null, loading: false, error: null, stale: false, nowMs: NOW });
  assert.equal(missing.detail, "NO INSTANCE REPORTED");
});
