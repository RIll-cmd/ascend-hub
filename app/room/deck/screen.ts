import type { DeckAgent } from "./deck-view";

export type ScreenState = {
  name: string; color: string; state: DeckAgent["state"]; activity: string | null; roles: string[];
  mini?: boolean; label?: string; done?: boolean;
  look?: number; blink?: boolean; // gaze -1 (left) .. 1 (right); blink closes the eye for a moment
  // What the agent is doing, drawn instead of the eye (see graphicFor); tick animates it.
  graphic?: "code" | "review" | "plan" | "wave" | null; tick?: number; lines?: string[];
};
export type Ctx2D = Pick<CanvasRenderingContext2D,
  "fillRect" | "fillText" | "beginPath" | "arc" | "fill" | "stroke" | "fillStyle" | "strokeStyle" | "font" | "textAlign" | "globalAlpha" | "lineWidth">;

export const screenKey = (s: ScreenState) =>
  JSON.stringify([s.name, s.color, s.state, s.activity, s.roles, s.mini, s.label, s.done, Math.round((s.look ?? 0) * 4), Boolean(s.blink), s.graphic, s.graphic ? s.tick : 0, s.lines]);

// Activity graphics: code typing in, a diff under a magnifier, the plan, a sound wave. Deterministic for a given tick.
function paintGraphic(ctx: Ctx2D, w: number, h: number, s: ScreenState) {
  const t = s.tick ?? 0;
  const x0 = w * 0.08;
  const y0 = h * 0.3;
  if (s.graphic === "code") {
    // Lines of code typing in, the last one growing with a cursor.
    const widths = [0.55, 0.38, 0.62, 0.3, 0.5, 0.44, 0.58];
    const shown = 1 + (t % (widths.length * 4)) / 4;
    for (let i = 0; i < Math.min(widths.length, Math.ceil(shown)); i++) {
      const frac = i < Math.floor(shown) ? 1 : shown - Math.floor(shown);
      const indent = [0, 1, 1, 2, 1, 2, 0][i] * w * 0.05;
      ctx.fillStyle = i % 3 === 0 ? s.color : "#9fe870";
      ctx.fillRect(x0 + indent, y0 + i * h * 0.075, w * widths[i] * frac, h * 0.035);
      if (i === Math.ceil(shown) - 1 && t % 2 === 0) { ctx.fillStyle = "#f3e6cf"; ctx.fillRect(x0 + indent + w * widths[i] * frac + 4, y0 + i * h * 0.075 - 2, 8, h * 0.045); }
    }
  } else if (s.graphic === "review") {
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i === 2 || i === 5 ? "#ff8a8a" : i === 3 || i === 4 ? "#9fe870" : "#6b6b6b";
      ctx.fillRect(x0, y0 + i * h * 0.075, w * (0.4 + ((i * 37) % 30) / 100), h * 0.035);
    }
    const mx = x0 + w * (0.25 + 0.25 * Math.sin(t / 6));
    const my = y0 + h * (0.22 + 0.12 * Math.cos(t / 9));
    ctx.strokeStyle = "#f3e6cf"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(mx, my, h * 0.11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(mx + h * 0.15, my + h * 0.15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f3e6cf"; ctx.fillRect(mx + h * 0.07, my + h * 0.07, h * 0.12, 8);
  } else if (s.graphic === "plan") {
    ctx.textAlign = "left";
    ctx.font = `${Math.round(h / 13)}px monospace`;
    (s.lines ?? []).slice(0, 5).forEach((line, i) => {
      ctx.fillStyle = line.startsWith("▸") ? "#ffcf5a" : line.startsWith("☑") ? "#9fe870" : "#c9b79a";
      ctx.fillText(line.slice(0, 20), x0, y0 + 10 + i * h * 0.1);
    });
  } else if (s.graphic === "wave") {
    const bars = 22;
    for (let i = 0; i < bars; i++) {
      const v = Math.abs(Math.sin(t * 0.7 + i * 0.6) * Math.cos(t * 0.31 + i * 0.23));
      const bh = h * (0.06 + 0.42 * v);
      ctx.fillStyle = s.color;
      ctx.fillRect(x0 + i * (w * 0.84 / bars), h * 0.55 - bh / 2, w * 0.84 / bars - 6, bh);
    }
  }
}

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
  if (s.graphic && !s.mini) {
    paintGraphic(ctx, w, h, s);
    ctx.textAlign = "left";
    ctx.fillStyle = s.color;
    ctx.font = `bold ${Math.round(h / 10)}px monospace`;
    ctx.fillText(s.name.toUpperCase(), w * 0.06, h * 0.14);
    ctx.fillStyle = "#c9b79a";
    ctx.font = `${Math.round(h / 14)}px monospace`;
    ctx.fillText(s.roles.join(" · "), w * 0.06, h * 0.23);
    ctx.textAlign = "center";
    ctx.fillStyle = "#9fe870";
    ctx.font = `${Math.round(h / 10)}px monospace`;
    ctx.fillText(stateWord(s), w / 2, h * 0.92);
    return;
  }
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
  ctx.fillStyle = "#c9b79a";
  ctx.font = `${Math.round(h / 14)}px monospace`;
  ctx.fillText(s.roles.join(" · "), w * 0.06, h * 0.23);
  ctx.textAlign = "center";
  ctx.fillStyle = "#9fe8b0";
  ctx.font = `${Math.round(h / 10)}px monospace`;
  ctx.fillText(stateWord(s), cx, h * 0.9);
}
