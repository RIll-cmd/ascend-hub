export type VisionEyeServiceId =
  | "ascend-core"
  | "ascend-vision"
  | "codex-cli"
  | "antigravity-cli";

export type VisionEyeDirection = "left" | "right" | "up" | "down";
export type VisionEyeCommand = VisionEyeDirection | "activate";
export type TvSignalTransitionPhase = "idle" | "collapsing" | "traveling" | "reconstructing";
export type TvSignalScreenMode = "default" | "active" | "departing" | "arriving";

export interface TvSignalTransitionState {
  activeTvId: VisionEyeServiceId;
  sourceTvId: VisionEyeServiceId | null;
  targetTvId: VisionEyeServiceId | null;
  direction: VisionEyeDirection | null;
  phase: TvSignalTransitionPhase;
}

export interface VisionEyeTarget {
  serviceId: VisionEyeServiceId;
  channel: "CH 01" | "CH 02" | "CH 03" | "CH 04";
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createTvSignalState(activeTvId: VisionEyeServiceId): TvSignalTransitionState {
  return {
    activeTvId,
    sourceTvId: null,
    targetTvId: null,
    direction: null,
    phase: "idle",
  };
}

export function beginTvSignalTransition(
  state: TvSignalTransitionState,
  targetTvId: VisionEyeServiceId,
  direction: VisionEyeDirection,
): TvSignalTransitionState {
  if (state.phase !== "idle" || state.activeTvId === targetTvId) return state;

  return {
    activeTvId: targetTvId,
    sourceTvId: state.activeTvId,
    targetTvId,
    direction,
    phase: "collapsing",
  };
}

export function advanceTvSignalTransition(
  state: TvSignalTransitionState,
): TvSignalTransitionState {
  if (state.phase === "collapsing") return { ...state, phase: "traveling" };
  if (state.phase === "traveling") return { ...state, phase: "reconstructing" };
  if (state.phase === "reconstructing") return createTvSignalState(state.activeTvId);
  return state;
}

export function getTvSignalScreenMode(
  serviceId: VisionEyeServiceId,
  state: TvSignalTransitionState,
): TvSignalScreenMode {
  if (state.phase === "idle" && state.activeTvId === serviceId) return "active";
  if (state.phase === "collapsing" && state.sourceTvId === serviceId) return "departing";
  if (state.phase === "reconstructing" && state.targetTvId === serviceId) return "arriving";
  return "default";
}

export function getVisionEyeCommand(
  event: Pick<KeyboardEvent, "key">,
): VisionEyeCommand | null {
  const key = event.key.toLowerCase();

  if (key === "arrowleft" || key === "a") return "left";
  if (key === "arrowright" || key === "d") return "right";
  if (key === "arrowup" || key === "w") return "up";
  if (key === "arrowdown" || key === "s") return "down";
  if (event.key === " " || event.key === "Spacebar") return "activate";

  return null;
}

export function isVisionEyeKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;

  const interactiveSelector =
    "input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='textbox']";

  return target.matches(interactiveSelector) || Boolean(target.closest(interactiveSelector));
}

export function findDirectionalVisionEyeTarget(
  currentId: VisionEyeServiceId,
  direction: VisionEyeDirection,
  targets: readonly VisionEyeTarget[],
): VisionEyeTarget | null {
  const current = targets.find(target => target.serviceId === currentId);
  if (!current) return null;

  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const candidates = targets.filter(target => {
    if (target.serviceId === currentId) return false;
    const primary = horizontal ? target.x - current.x : target.y - current.y;
    return primary * sign > 0;
  });

  const axisAlignedCandidates = candidates.filter(target => {
    const primary = Math.abs(horizontal ? target.x - current.x : target.y - current.y);
    const cross = Math.abs(horizontal ? target.y - current.y : target.x - current.x);
    return cross <= primary * 1.2;
  });
  const directionalCandidates = axisAlignedCandidates;

  const score = (target: VisionEyeTarget) => {
    const primary = Math.abs(horizontal ? target.x - current.x : target.y - current.y);
    const cross = Math.abs(horizontal ? target.y - current.y : target.x - current.x);
    return primary + cross * 1.75;
  };

  return directionalCandidates.toSorted((a, b) => score(a) - score(b))[0] ?? current;
}
