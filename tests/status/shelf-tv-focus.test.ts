import assert from "node:assert/strict";
import test from "node:test";

test("scene camera centers the clicked TV while keeping shelf coordinates intact", async () => {
  let focusModule: typeof import("../../components/status/shelf-tv-focus") | undefined;

  try {
    focusModule = await import("../../components/status/shelf-tv-focus");
  } catch {
    // The first TDD run intentionally reaches this branch before the feature exists.
  }

  assert.equal(typeof focusModule?.getShelfSceneCameraMotion, "function");

  const motion = focusModule!.getShelfSceneCameraMotion(
    { left: 300, top: 250, width: 200, height: 200 },
    { left: 100, top: 50, width: 1200, height: 800 },
    { width: 1440, height: 900 },
  );

  assert.deepEqual(motion, {
    scale: 3.15,
    translateX: -325,
    translateY: -545,
  });
});

test("scene camera caps magnification for very small TV screens", async () => {
  let focusModule: typeof import("../../components/status/shelf-tv-focus") | undefined;

  try {
    focusModule = await import("../../components/status/shelf-tv-focus");
  } catch {
    // The first TDD run intentionally reaches this branch before the feature exists.
  }

  assert.equal(typeof focusModule?.getShelfSceneCameraMotion, "function");

  const motion = focusModule!.getShelfSceneCameraMotion(
    { left: 175, top: 360, width: 30, height: 30 },
    { left: 0, top: 180, width: 390, height: 900 },
    { width: 390, height: 700 },
  );

  assert.deepEqual(motion, {
    scale: 3.2,
    translateX: -413,
    translateY: -454,
  });
});

test("scene camera centers the TV inside a desktop focus region reserved for the console", async () => {
  const { getShelfSceneCameraMotion } = await import("../../components/status/shelf-tv-focus");
  const target = { left: 300, top: 250, width: 200, height: 200 };
  const scene = { left: 100, top: 50, width: 1200, height: 800 };

  const motion = getShelfSceneCameraMotion(
    target,
    scene,
    { width: 1440, height: 900 },
    { left: 0, top: 0, width: 900, height: 900 },
  );

  const localTargetCenter = target.left + target.width / 2 - scene.left;
  const projectedCenter = scene.left + motion.translateX + localTargetCenter * motion.scale;

  assert.equal(Math.round(projectedCenter), 450);
  assert.deepEqual(motion, {
    scale: 3.15,
    translateX: -595,
    translateY: -545,
  });
});
