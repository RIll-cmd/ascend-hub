import type { DeckAgent } from "./deck-view";

export type ScreenState = {
  name: string; color: string; state: DeckAgent["state"]; activity: string | null; roles: string[];
  mini?: boolean; label?: string; done?: boolean;
  look?: number; blink?: boolean; // gaze -1 (left) .. 1 (right); blink closes the eye for a moment
};
export type Ctx2D = Pick<CanvasRenderingContext2D,
  "fillRect" | "fillText" | "beginPath" | "arc" | "fill" | "stroke" | "fillStyle" | "strokeStyle" | "font" | "textAlign" | "globalAlpha" | "lineWidth">;

export const screenKey = (s: ScreenState) =>
  JSON.stringify([s.name, s.color, s.state, s.activity, s.roles, s.mini, s.label, s.done, Math.round((s.look ?? 0) * 4), Boolean(s.blink)]);

function stateWord(s: ScreenState): string {
  if (s.state === "busy") return `${s.activity ?? "working"}…`;
  if (s.state === "checking") return "checking…";
  return "idle";
}

// Draws one CRT screen: scanlines, the agent's eye, name, roles and state. Deterministic, so it is testable.
export function paintScreen(ctx: Ctx2D, w: number, h: number, s: ScreenState): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0d0f0c";
  ctx.fillRect(0, 0, w, h);
  if (s.state === "offline") {
    let seed = 7;
    for (let i = 0; i < 420; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const v = 60 + (seed % 140);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(seed % w, (seed * 7) % h, 3, 2);
    }
    ctx.fillStyle = "#f3e6cf";
    ctx.font = `bold ${Math.round(h / 8)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("NO SIGNAL", w / 2, h / 2);
    return;
  }
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  // Vignette: darker edges like a curved tube.
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 0.35;
  const edge = Math.round(h / 14);
  ctx.fillRect(0, 0, w, edge);
  ctx.fillRect(0, h - edge, w, edge);
  ctx.fillRect(0, 0, edge, h);
  ctx.fillRect(w - edge, 0, edge, h);
  ctx.globalAlpha = 1;
  const busy = s.state === "busy";
  const cx = w / 2;
  const cy = s.mini ? h * 0.42 : h * 0.48;
  const radius = (s.mini ? h * 0.22 : h * 0.2) * (busy ? 1.12 : 1);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(2, h / 40);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (s.blink) {
    ctx.fillStyle = s.color;
    ctx.fillRect(cx - radius * 0.8, cy - Math.max(2, h / 90), radius * 1.6, Math.max(3, h / 45));
  } else {
    const look = Math.max(-1, Math.min(1, s.look ?? 0));
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(cx + look * radius * 0.45, cy, radius * (busy ? 0.55 : 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3e6cf";
  if (s.mini) {
    ctx.font = `${Math.round(h / 8)}px monospace`;
    ctx.fillText(s.done ? "✓" : (s.label ?? "").slice(0, 18), cx, h * 0.86);
    if (s.done) ctx.fillText(s.label?.slice(0, 18) ?? "", cx, h * 0.97);
    return;
  }
  ctx.fillStyle = s.color;
  ctx.font = `bold ${Math.round(h / 10)}px monospace`;
  ctx.textAlign = "left";
  ctx.fillText(s.name.toUpperCase(), w * 0.06, h * 0.14);
  ctx.textAlign = "right";
  ctx.fillStyle = "#c9b79a";
  ctx.font = `${Math.round(h / 13)}px monospace`;
  ctx.fillText(s.roles.join(" · "), w * 0.94, h * 0.14);
  ctx.textAlign = "center";
  ctx.fillStyle = "#9fe8b0";
  ctx.font = `${Math.round(h / 10)}px monospace`;
  ctx.fillText(stateWord(s), cx, h * 0.9);
}
