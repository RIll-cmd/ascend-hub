export interface ShelfTvFocusRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ShelfTvFocusViewport {
  width: number;
  height: number;
}

export interface ShelfSceneCameraMotion {
  scale: number;
  translateX: number;
  translateY: number;
}

const MAX_CAMERA_SCALE = 3.2;

export function getShelfSceneCameraMotion(
  target: ShelfTvFocusRect,
  scene: ShelfTvFocusRect,
  viewport: ShelfTvFocusViewport,
): ShelfSceneCameraMotion {
  const scale = Math.min(
    viewport.width * 0.72 / target.width,
    viewport.height * 0.7 / target.height,
    MAX_CAMERA_SCALE,
  );
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const localCenterX = targetCenterX - scene.left;
  const localCenterY = targetCenterY - scene.top;

  return {
    scale,
    translateX: viewport.width / 2 - scene.left - localCenterX * scale,
    translateY: viewport.height / 2 - scene.top - localCenterY * scale,
  };
}
