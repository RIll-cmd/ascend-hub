import type { DeckAgent } from "./deck-view";

export type ScreenState = {
  name: string; color: string; state: DeckAgent["state"]; activity: string | null; roles: string[];
  mini?: boolean; label?: string; done?: boolean;
};
export type Ctx2D = Pick<CanvasRenderingContext2D,
  "fillRect" | "fillText" | "beginPath" | "arc" | "fill" | "stroke" | "fillStyle" | "strokeStyle" | "font" | "textAlign" | "globalAlpha" | "lineWidth">;

export const screenKey = (s: ScreenState) => JSON.stringify([s.name, s.color, s.state, s.activity, s.roles, s.mini, s.label, s.done]);

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
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  const busy = s.state === "busy";
  const cx = w / 2;
  const cy = s.mini ? h * 0.42 : h * 0.48;
  const radius = (s.mini ? h * 0.22 : h * 0.2) * (busy ? 1.12 : 1);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(2, h / 48);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * (busy ? 0.55 : 0.4), 0, Math.PI * 2);
  ctx.fill();
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
