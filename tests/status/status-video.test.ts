import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { classifyStatusMediaFailure, getShelfTvAccessibleLabel, ShelfStatusTv } from "../../components/status/ShelfStatusTv";
import { getStatusVideo } from "../../components/status/status-video";
import * as videos from "../../components/status/status-video";
import { deriveShelfTvPresentation } from "../../components/status/status-presentation";

const assignment = { channel: "CH 01", serviceId: "ascend-core" } as const;
const profile = {
  collectibleId: "test-tv",
  label: "Test TV",
  image: "/test-tv.png",
  defaultVideo: "/unused.mp4",
  screen: { top: "0", left: "0", width: "100%", height: "100%", radius: "0" },
};
const service = {
  serviceId: "ascend-core",
  instanceId: "core-local-1",
  serviceType: "agent" as const,
  state: "working" as const,
  stateSince: "2026-09-20T00:00:00.000Z",
  lastHeartbeatAt: "2026-09-20T00:00:00.000Z",
  staleAfterSeconds: 30,
};

test("each reported service state resolves to its own playable local status clip", () => {
  const expected = {
    idle: "/TV-STATUS/idle.mp4",
    working: "/TV-STATUS/working.mp4",
    stuck: "/TV-STATUS/stuck.mp4",
    offline: "/TV-STATUS/offline.mp4",
  } as const;

  for (const [state, src] of Object.entries(expected)) {
    const video = getStatusVideo(state as keyof typeof expected);
    assert.equal(video?.src, src);
    assert.equal(existsSync(join(process.cwd(), "public", src)), true);
  }
});
test("unavailable telemetry uses the signal-loss clip without a lifecycle claim", () => {
  assert.equal(videos.getSignalLossVideo().src, "/TV-STATUS/offline.mp4");
});

test("the frantic stuck clip is softened without slowing the other service states", () => {
  assert.equal(getStatusVideo("stuck")?.playbackRate, 0.82);
  assert.equal(getStatusVideo("idle")?.playbackRate, 1);
  assert.equal(getStatusVideo("working")?.playbackRate, 1);
  assert.equal(getStatusVideo("offline")?.playbackRate, 1);
});

test("a reported state renders a silent decorative loop while preserving textual live status", () => {
  const markup = renderToStaticMarkup(createElement(ShelfStatusTv, {
    assignment,
    profile,
    service,
    presentation: deriveShelfTvPresentation({ service, loading: false, error: null, nowMs: Date.parse(service.lastHeartbeatAt) }),
    loading: false,
    error: null,
    stale: false,
  }));

  assert.match(markup, /<video[^>]+src="\/TV-STATUS\/working\.mp4"/);
  assert.match(markup, /<video[^>]+autoPlay=""/);
  assert.match(markup, /<video[^>]+loop=""/);
  assert.match(markup, /<video[^>]+muted=""/);
  assert.match(markup, /<video[^>]+playsInline=""/);
  assert.match(markup, /<video[^>]+aria-hidden="true"/);
  assert.match(markup, />Working</);
  assert.match(markup, /role="status"/);
  assert.doesNotMatch(markup, /shelf-status-tv__signal|shelf-status-tv__state|>LIVE</);
});

test("an unreported service renders the existing accessible fallback without a video", () => {
  const markup = renderToStaticMarkup(createElement(ShelfStatusTv, {
    assignment,
    profile,
    service: null,
    loading: true,
    error: null,
    stale: false,
  }));

  assert.doesNotMatch(markup, /<video/);
  assert.match(markup, />Checking status</);
  assert.match(markup, /Waiting for the first status report/);
  assert.doesNotMatch(markup, />LIVE<|NO SIGNAL/);
});

test("selection layers full-screen Fairy over the mounted service video", () => {
  const markup = renderToStaticMarkup(createElement(ShelfStatusTv, {
    assignment, profile, service, loading: false, error: null, stale: false, signalMode: "active",
  }));
  assert.match(markup, /src="\/TV-STATUS\/working.mp4"/);
  assert.match(markup, /class="shelf-status-tv__entity-layer"/);
  assert.match(markup, /vision-eye-receiver--active/);
  assert.match(markup, /FAIRY LINK/);
  assert.match(markup, /selection-light is-on/);
  assert.doesNotMatch(markup, /is-suppressed|SELECTED/);
});

test("missing telemetry uses signal loss without rewriting lifecycle and cached video has a bezel label", () => {
  const props = { assignment, profile, loading: false, error: "unavailable", stale: true };
  const missing = renderToStaticMarkup(createElement(ShelfStatusTv, { ...props, service: null }));
  assert.match(missing, /src="\/TV-STATUS\/offline.mp4"/);
  assert.match(missing, /Status unavailable/);
  assert.doesNotMatch(missing, /NO SIGNAL|>Offline</);
  const cached = renderToStaticMarkup(createElement(ShelfStatusTv, { ...props, service }));
  assert.match(cached, /src="\/TV-STATUS\/working.mp4"/);
  assert.match(cached, /<em>Last known<\/em>/);
  assert.match(cached, /Last known working/);
});

test("reduced motion keeps a video frame available without autoplay", () => {
  const markup = renderToStaticMarkup(createElement(ShelfStatusTv, {
    assignment, profile, service, loading: false, error: null, stale: false, reduceMotion: true,
  }));
  assert.match(markup, /<video/);
  assert.doesNotMatch(markup, /autoPlay/);
});

test("the TV control accessible name includes instance, lifecycle, freshness, and independent media failures", () => {
  const presentation = deriveShelfTvPresentation({ service, loading: false, error: null,
    nowMs: Date.parse(service.lastHeartbeatAt) + 31_000 });
  const label = getShelfTvAccessibleLabel(assignment, presentation, "unavailable");
  const markup = renderToStaticMarkup(createElement("button", { "aria-label": label }, "Open details"));
  assert.match(markup, /aria-label="Open CH 01 Ascend Core status details\. Ascend Core, instance core-local-1\. Last known working\./);
  assert.match(markup, /The status report is stale\. Latest report: 31 seconds ago/);
  assert.match(markup, /Status video unavailable/);
  const unavailable = deriveShelfTvPresentation({ service: null, loading: false, error: "unavailable", nowMs: 0 });
  assert.match(getShelfTvAccessibleLabel(assignment, unavailable), /Status unavailable\. Cannot reach the status feed/);
  assert.doesNotMatch(getShelfTvAccessibleLabel(assignment, unavailable), /Offline|LIVE/);
});

test("autoplay policy is distinct from an unsupported clip and cannot overwrite a media error", () => {
  assert.equal(classifyStatusMediaFailure(new DOMException("blocked", "NotAllowedError"), null), "autoplay");
  assert.equal(classifyStatusMediaFailure(new DOMException("unsupported", "NotSupportedError"), null), "unavailable");
  assert.equal(classifyStatusMediaFailure(new Error("decoder failed"), null), "unavailable");
  assert.equal(classifyStatusMediaFailure(new DOMException("blocked", "NotAllowedError"), "unavailable"), "unavailable");
});