export interface PointerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function normalizedPointer(clientX: number, clientY: number, rect: PointerRect) {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 2 - 1),
    y: clamp(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

export function dampedAxis(current: number, target: number, damping: number) {
  return current + (target - current) * Math.max(0, Math.min(1, damping));
}
