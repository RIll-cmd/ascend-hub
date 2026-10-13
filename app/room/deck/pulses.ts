export type Vec3 = [number, number, number];

// Quadratic Bézier from `from` to `to`, lifted by `height` at the middle.
export function arcPoints(from: Vec3, to: Vec3, height: number, segments = 24): Vec3[] {
  const control: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + height, (from[2] + to[2]) / 2];
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return [0, 1, 2].map(k => a * from[k] + b * control[k] + c * to[k]) as Vec3;
  });
}

export function pulseProgress(startMs: number, nowMs: number, durationMs = 1200): number {
  return Math.min(1, Math.max(0, (nowMs - startMs) / durationMs));
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
