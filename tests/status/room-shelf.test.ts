import assert from "node:assert/strict";
import test from "node:test";

import type { RoomStatus, SessionView } from "../../app/room/room-types";
import { roomShelfServices } from "../../components/status/room-shelf";
import { resolveShelfTvService } from "../../components/status/shelf-tv-assignment";
import { deriveShelfTvPresentation } from "../../components/status/status-presentation";

const nowMs = Date.parse("2026-10-28T10:00:00.000Z");
const status = (agy: "ready" | "offline" = "ready"): RoomStatus => ({
  online: true, agents: { claude: { state: "ready" }, codex: { state: "ready" }, agy: { state: agy } },
});
const session = (stage: string, active: SessionView["active"] = null) => ({
  id: "s1", mode: "build", project: "p", projectDir: "D:\\p", task: "Build a todo app", stage,
  roles: { orchestrator: "codex", coders: ["claude"], reviewer: "agy" },
  plan: { tasks: [{ id: 1, title: "Login form", status: "running", assignee: "claude" }] },
  pause: null, active, transcript: [],
}) as unknown as SessionView;

const byId = (services: ReturnType<typeof roomShelfServices>) => Object.fromEntries(services.map(s => [s.serviceId, s]));

test("a closed room reports no agent TVs", () => {
  assert.deepEqual(roomShelfServices(null, null, nowMs, nowMs), []);
});

test("an idle room shows every ready agent idle and an unavailable CLI offline", () => {
  const tvs = byId(roomShelfServices(status("offline"), null, nowMs, nowMs));
  assert.deepEqual(Object.keys(tvs).sort(), ["antigravity-cli", "claude-cli", "codex-cli"]);
  assert.equal(tvs["claude-cli"].state, "idle");
  assert.equal(tvs["codex-cli"].state, "idle");
  assert.equal(tvs["antigravity-cli"].state, "offline");
  assert.equal(tvs["claude-cli"].serviceType, "agent");
});

test("the coding agent works and says what it is on", () => {
  const since = new Date(nowMs - 4 * 60_000).toISOString();
  const tvs = byId(roomShelfServices(status(), session("build", { agent: "claude", activity: "editing", since } as SessionView["active"]), nowMs, nowMs));
  assert.equal(tvs["claude-cli"].state, "working");
  assert.equal(tvs["claude-cli"].activity?.label, "task 1/1 · Login form · 4m");
  assert.equal(tvs["claude-cli"].stateSince, since);
  assert.equal(tvs["codex-cli"].state, "idle");
});

test("the agent holding a gate needs you", () => {
  const tvs = byId(roomShelfServices(status(), session("gate-plan"), nowMs, nowMs));
  assert.equal(tvs["codex-cli"].state, "stuck");
  assert.equal(tvs["codex-cli"].issue?.message, "approve the plan");
  assert.equal(tvs["claude-cli"].state, "idle");
});

test("a fresh room report is current on the shelf, an old one turns stale", () => {
  const services = roomShelfServices(status(), null, nowMs - 5_000, nowMs);
  const claude = resolveShelfTvService("slot-1-1-t", services, undefined, nowMs);
  assert.equal(claude?.serviceId, "claude-cli");
  assert.equal(deriveShelfTvPresentation({ service: claude, loading: false, error: null, nowMs }).freshness, "current");
  const old = roomShelfServices(status(), null, nowMs - 120_000, nowMs)[0];
  assert.equal(deriveShelfTvPresentation({ service: old, loading: false, error: null, nowMs }).freshness, "stale");
});

test("a report fetched a moment after the shelf clock is still current", () => {
  const services = roomShelfServices(status(), null, nowMs + 800, nowMs);
  assert.equal(deriveShelfTvPresentation({ service: services[0], loading: false, error: null, nowMs }).freshness, "current");
});

test("a closed room explains itself on the TV", () => {
  const presentation = deriveShelfTvPresentation({ service: null, loading: false, error: "The agent room is not running.", nowMs });
  assert.equal(presentation.explanation, "The agent room is not running.");
});
