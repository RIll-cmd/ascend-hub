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

export interface ShelfCameraFocusArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MAX_CAMERA_SCALE = 3.2;

export function getShelfSceneCameraMotion(
  target: ShelfTvFocusRect,
  scene: ShelfTvFocusRect,
  viewport: ShelfTvFocusViewport,
  focusArea?: ShelfCameraFocusArea,
): ShelfSceneCameraMotion {
  const area = focusArea ?? { left: 0, top: 0, width: viewport.width, height: viewport.height };
  const scale = Math.min(
    area.width * 0.72 / target.width,
    area.height * 0.7 / target.height,
    MAX_CAMERA_SCALE,
  );
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const localCenterX = targetCenterX - scene.left;
  const localCenterY = targetCenterY - scene.top;

  return {
    scale,
    translateX: area.left + area.width / 2 - scene.left - localCenterX * scale,
    translateY: area.top + area.height / 2 - scene.top - localCenterY * scale,
  };
}
