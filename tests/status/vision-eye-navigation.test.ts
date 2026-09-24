import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  advanceTvSignalTransition,
  beginTvSignalTransition,
  createTvSignalState,
  findDirectionalVisionEyeTarget,
  getTvSignalScreenMode,
  getVisionEyeCommand,
  type VisionEyeTarget,
} from "../../components/status/vision-eye-navigation";

const targets: VisionEyeTarget[] = [
  { serviceId: "ascend-core", channel: "CH 01", x: 100, y: 100, width: 80, height: 60 },
  { serviceId: "ascend-vision", channel: "CH 02", x: 400, y: 110, width: 80, height: 60 },
  { serviceId: "codex-cli", channel: "CH 03", x: 110, y: 350, width: 80, height: 60 },
  { serviceId: "antigravity-cli", channel: "CH 04", x: 410, y: 360, width: 80, height: 60 },
];

test("maps arrows and WASD to movement and Space to activation", () => {
  assert.equal(getVisionEyeCommand({ key: "ArrowLeft" }), "left");
  assert.equal(getVisionEyeCommand({ key: "d" }), "right");
  assert.equal(getVisionEyeCommand({ key: "W" }), "up");
  assert.equal(getVisionEyeCommand({ key: "s" }), "down");
  assert.equal(getVisionEyeCommand({ key: " " }), "activate");
  assert.equal(getVisionEyeCommand({ key: "Spacebar" }), "activate");
  assert.equal(getVisionEyeCommand({ key: "Enter" }), null);
});

test("chooses the nearest TV in the requested direction", () => {
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "right", targets)?.serviceId, "ascend-vision");
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "down", targets)?.serviceId, "codex-cli");
  assert.equal(findDirectionalVisionEyeTarget("antigravity-cli", "left", targets)?.serviceId, "codex-cli");
  assert.equal(findDirectionalVisionEyeTarget("antigravity-cli", "up", targets)?.serviceId, "ascend-vision");
});

test("keeps selection when no target exists in that direction", () => {
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "left", targets)?.serviceId, "ascend-core");
});

test("prefers the intended column on a wide shelf with slightly staggered rows", () => {
  const wideTargets: VisionEyeTarget[] = [
    { serviceId: "ascend-core", channel: "CH 01", x: 100, y: 100, width: 80, height: 60 },
    { serviceId: "ascend-vision", channel: "CH 02", x: 900, y: 110, width: 80, height: 60 },
    { serviceId: "codex-cli", channel: "CH 03", x: 105, y: 400, width: 80, height: 60 },
    { serviceId: "antigravity-cli", channel: "CH 04", x: 905, y: 410, width: 80, height: 60 },
  ];

  assert.equal(
    findDirectionalVisionEyeTarget("ascend-core", "right", wideTargets)?.serviceId,
    "ascend-vision",
  );
  assert.equal(
    findDirectionalVisionEyeTarget("ascend-vision", "down", wideTargets)?.serviceId,
    "antigravity-cli",
  );
});

test("returns null when the current TV has not been measured", () => {
  assert.equal(findDirectionalVisionEyeTarget("ascend-core", "right", targets.slice(1)), null);
});

test("does not jump rows at the right or bottom edge of a staggered grid", () => {
  assert.equal(findDirectionalVisionEyeTarget("ascend-vision", "right", targets)?.serviceId, "ascend-vision");
  assert.equal(findDirectionalVisionEyeTarget("codex-cli", "down", targets)?.serviceId, "codex-cli");
});

test("renders a procedural eye instead of embedding the source GIF", async () => {
  const source = await readFile("components/status/VisionEyeEntity.tsx", "utf8");

  assert.match(source, /fairy-eye__aperture/);
  assert.match(source, /fairy-eye__iris/);
  assert.match(source, /fairy-eye__pupil/);
  assert.match(source, /fairy-eye__specular/);
  assert.match(source, /fairy-eye__orbital-fin/);
  assert.doesNotMatch(source, /vision-eye__outer-ring/);
  assert.doesNotMatch(source, /fairy-gif|<img|next\/image/i);
});

test("defines CRT signal motion and a reduced-motion fallback", async () => {
  const source = await readFile("app/globals.css", "utf8");

  assert.match(source, /@keyframes fairy-eye-aura/);
  assert.match(source, /@keyframes fairy-eye-orbit-step/);
  assert.match(source, /@keyframes vision-eye-collapse/);
  assert.match(source, /@keyframes vision-eye-reconstruct/);
  assert.match(source, /@keyframes vision-eye-signal-transfer/);
  assert.match(source, /@keyframes fairy-eye-iris-breathe/);
  assert.match(source, /@keyframes fairy-eye-pupil-drift/);
  assert.match(source, /@keyframes vision-eye-focus-launch/);
  assert.match(source, /\.vision-eye-receiver--departing/);
  assert.match(source, /\.vision-eye-receiver--arriving/);
  assert.match(source, /prefers-reduced-motion:[^)]+[\s\S]*\.fairy-eye__pupil/);
});

test("page integrates selection-only movement and Space activation", async () => {
  const source = await readFile("app/page.tsx", "utf8");

  assert.match(source, /selectedVisionEyeServiceId/);
  assert.match(source, /getVisionEyeCommand/);
  assert.match(source, /activateStatusTv/);
  assert.match(source, /data-status-service-id/);
  assert.match(source, /<VisionEyeNavigator/);
});

test("starts a TV signal transfer at the source collapse phase", () => {
  const initial = createTvSignalState("ascend-core");
  const next = beginTvSignalTransition(initial, "ascend-vision", "right");

  assert.deepEqual(next, {
    activeTvId: "ascend-vision",
    sourceTvId: "ascend-core",
    targetTvId: "ascend-vision",
    direction: "right",
    phase: "collapsing",
  });
  assert.equal(getTvSignalScreenMode("ascend-core", next), "departing");
  assert.equal(getTvSignalScreenMode("ascend-vision", next), "default");
});

test("advances signal transfer through gap, reconstruction, and settled idle", () => {
  const collapsing = beginTvSignalTransition(
    createTvSignalState("ascend-core"),
    "ascend-vision",
    "right",
  );
  const traveling = advanceTvSignalTransition(collapsing);
  const reconstructing = advanceTvSignalTransition(traveling);
  const settled = advanceTvSignalTransition(reconstructing);

  assert.equal(traveling.phase, "traveling");
  assert.equal(getTvSignalScreenMode("ascend-core", traveling), "default");
  assert.equal(getTvSignalScreenMode("ascend-vision", traveling), "default");
  assert.equal(reconstructing.phase, "reconstructing");
  assert.equal(getTvSignalScreenMode("ascend-vision", reconstructing), "arriving");
  assert.deepEqual(settled, createTvSignalState("ascend-vision"));
  assert.equal(getTvSignalScreenMode("ascend-vision", settled), "active");
});

test("ignores overlapping transfers while the receiver is changing channels", () => {
  const collapsing = beginTvSignalTransition(
    createTvSignalState("ascend-core"),
    "ascend-vision",
    "right",
  );

  assert.equal(
    beginTvSignalTransition(collapsing, "antigravity-cli", "down"),
    collapsing,
  );
});

test("does not animate when selecting the already active TV", () => {
  const initial = createTvSignalState("ascend-core");
  assert.equal(beginTvSignalTransition(initial, "ascend-core", "right"), initial);
});

test("renders the eye inside each CRT receiver instead of as a moving scene entity", async () => {
  const navigator = await readFile("components/status/VisionEyeNavigator.tsx", "utf8");
  const receiver = await readFile("components/status/ShelfStatusTv.tsx", "utf8");

  assert.match(navigator, /vision-eye-signal-pulse/);
  assert.doesNotMatch(navigator, /eyeX|eyeY|useMotionValue/);
  assert.match(receiver, /TvSignalScreenMode/);
  assert.match(receiver, /shelf-status-tv__entity-layer/);
  assert.match(receiver, /VisionEyeEntity/);
});
