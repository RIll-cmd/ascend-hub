import assert from "node:assert/strict";
import test from "node:test";
import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import * as presentations from "../../components/status/status-presentation";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const report: ShelfServiceStatus = {
  serviceId: "ascend-core", instanceId: "core-a", serviceType: "agent", state: "working",
  stateSince: "2026-10-02T11:59:00Z", lastHeartbeatAt: "2026-10-02T11:59:55Z", staleAfterSeconds: 30,
};
const input = { service: report, loading: false, error: null, stale: false, nowMs: NOW };

test("a successful feed with no matching instance is unavailable, not live or offline", () => {
  const result = presentations.deriveShelfTvPresentation({ ...input, service: null });
  assert.equal(result.lifecycle, null);
  assert.equal(result.freshness, "unavailable");
  assert.equal(result.video?.src, "/TV-STATUS/offline.mp4");
  assert.equal(result.heading, "Status unavailable");
  assert.match(result.explanation, /No instance reported/i);
  assert.doesNotMatch(result.accessibleDescription, /live|offline|complete/i);
});

test("first load has neutral static media and no invented report", () => {
  const result = presentations.deriveShelfTvPresentation({ ...input, service: null, loading: true });
  assert.equal(result.freshness, "loading");
  assert.equal(result.lifecycle, null);
  assert.equal(result.video, null);
  assert.equal(result.heading, "Checking status");
});

test("a successful poll cannot refresh an expired producer heartbeat", () => {
  const result = presentations.deriveShelfTvPresentation({ ...input, nowMs: NOW + 30_000 });
  assert.equal(result.lifecycle, "working");
  assert.equal(result.freshness, "stale");
  assert.equal(result.heading, "Last known working");
  assert.equal(result.reportAgeMs, 35_000);
  assert.equal(result.video?.src, "/TV-STATUS/working.mp4");
  assert.match(result.explanation, /35 seconds ago/i);
  assert.doesNotMatch(result.accessibleDescription, /live|complete/i);
});

test("cached evidence stays visible during refresh and ages even without a new response", () => {
  assert.equal(presentations.deriveShelfTvPresentation({ ...input, loading: true }).freshness, "current");
  assert.equal(presentations.deriveShelfTvPresentation({ ...input, loading: true, nowMs: NOW + 60_000 }).freshness, "stale");
});

test("an unavailable feed preserves cached lifecycle and explains the lost feed once", () => {
  const result = presentations.deriveShelfTvPresentation({ ...input, error: "Status Shelf is not configured on this Hub." });
  assert.equal(result.freshness, "stale");
  assert.equal(result.lifecycle, "working");
  assert.equal(result.video?.src, "/TV-STATUS/working.mp4");
  assert.match(result.explanation, /not configured/i);
  assert.match(result.explanation, /5 seconds ago/i);
});

test("missing selected instance is explicit and never recast as an offline lifecycle", () => {
  const result = presentations.deriveShelfTvPresentation({ ...input, service: null, selectedInstanceId: "core-a" });
  assert.equal(result.lifecycle, null);
  assert.equal(result.freshness, "unavailable");
  assert.match(result.explanation, /selected instance.*no longer reported/i);
});

test("invalid, future, and impossible timestamps cannot support current evidence", () => {
  for (const lastHeartbeatAt of ["invalid", "2026-10-02T12:00:01Z", "2026-02-30T12:00:00Z", "12"]) {
    const result = presentations.deriveShelfTvPresentation({ ...input, service: { ...report, lastHeartbeatAt } });
    assert.equal(result.freshness, "stale", lastHeartbeatAt);
    assert.equal(result.reportAgeMs, null, lastHeartbeatAt);
    assert.match(result.explanation, /cannot.*verif|invalid/i);
  }
});

test("invalid expiry values never allow a current report", () => {
  for (const staleAfterSeconds of [0, -1, NaN, Infinity]) {
    assert.equal(presentations.deriveShelfTvPresentation({ ...input, service: { ...report, staleAfterSeconds } }).freshness, "stale");
  }
});

test("expiry boundary is stale and fresh offline stays producer-reported offline", () => {
  assert.equal(presentations.deriveShelfTvPresentation({ ...input, nowMs: NOW + 25_000 }).freshness, "stale");
  const result = presentations.deriveShelfTvPresentation({ ...input, service: { ...report, state: "offline" } });
  assert.equal(result.freshness, "current");
  assert.equal(result.lifecycle, "offline");
  assert.equal(result.heading, "Offline");
  assert.match(result.explanation, /reported/i);
});

test("idle and stuck wording carries no completion or connectivity claim", () => {
  const idle = presentations.deriveShelfTvPresentation({ ...input, service: { ...report, state: "idle" } });
  assert.equal(idle.heading, "Idle");
  assert.doesNotMatch(idle.accessibleDescription, /complet|success|connected/i);
  const stuck = presentations.deriveShelfTvPresentation({ ...input, service: { ...report, state: "stuck" } });
  assert.equal(stuck.heading, "Needs attention");
});

test("raw errors are sanitized rather than copied into accessible status", () => {
  const result = presentations.deriveShelfTvPresentation({ ...input, service: null, error: "credential SECRET failed" });
  assert.match(result.explanation, /Cannot reach the status feed/i);
  assert.doesNotMatch(result.accessibleDescription, /SECRET/);
});

test("ISO times reject overflow components rather than normalizing them into current evidence", () => {
  for (const iso of ["2026-10-01T24:00:00Z", "2026-10-02T11:60:00Z", "2026-10-02T11:00:60Z", "2026-10-02T11:00:00+24:00", "2026-10-02T11:00:00+00:60"]) {
    assert.equal(presentations.validStatusTimestamp(iso), null, iso);
  }
  assert.equal(presentations.validStatusTimestamp("2026-10-02T19:59:55+08:00"), Date.parse(report.lastHeartbeatAt));
});

test("optional scalar fields from unvalidated metadata cannot crash or expose structured data", () => {
  assert.equal(presentations.safeStatusText({ secret: "PRIVATE" }), null);
  assert.equal(presentations.safeStatusText(123), null);
});
