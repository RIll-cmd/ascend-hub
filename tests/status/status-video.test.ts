import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ShelfStatusTv } from "../../components/status/ShelfStatusTv";
import { getStatusVideo } from "../../components/status/status-video";

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

test("an unavailable service keeps the non-video connecting or no-signal fallback", () => {
  assert.equal(getStatusVideo("unavailable"), null);
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
  assert.match(markup, />WORKING</);
  assert.match(markup, /role="status"/);
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
  assert.match(markup, />CONNECTING</);
  assert.match(markup, /OPENING STATUS CHANNEL/);
});
