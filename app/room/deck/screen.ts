import type { DeckAgent } from "./deck-view";
import type { TvMood, TvStatus } from "./tv-status";

export type ScreenState = {
  name: string; color: string; state: DeckAgent["state"]; activity: string | null; roles: string[];
  mini?: boolean; label?: string; done?: boolean;
  look?: number; blink?: boolean; // gaze -1 (left) .. 1 (right); blink closes the eye for a moment
  // What the agent is doing, drawn instead of the eye (see graphicFor); tick animates it.
  graphic?: "code" | "review" | "plan" | "wave" | null; tick?: number; lines?: string[];
  // The shelf-style status (channel bug, mascot, lower third); without it the screen keeps the plain eye.
  status?: TvStatus;
};
export type Ctx2D = Pick<CanvasRenderingContext2D,
  "fillRect" | "fillText" | "beginPath" | "arc" | "fill" | "stroke" | "moveTo" | "lineTo" | "fillStyle" | "strokeStyle" | "font" | "textAlign" | "globalAlpha" | "lineWidth">;

export const screenKey = (s: ScreenState) =>
  JSON.stringify([s.name, s.color, s.state, s.activity, s.roles, s.mini, s.label, s.done, Math.round((s.look ?? 0) * 4), Boolean(s.blink), s.graphic, s.graphic ? s.tick : 0, s.lines, s.status]);

// Activity graphics: code typing in, a diff under a magnifier, the plan, a sound wave. Deterministic for a given tick.
type Box = { x: number; y: number; w: number; h: number };
function paintGraphic(ctx: Ctx2D, box: Box, s: ScreenState) {
  const { w, h } = box;
  const t = s.tick ?? 0;
  const x0 = box.x + w * 0.08;
  const y0 = box.y + h * 0.3;
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
      ctx.fillRect(x0 + i * (w * 0.84 / bars), box.y + h * 0.55 - bh / 2, Math.max(2, w * 0.84 / bars - 6), bh);
    }
  }
}

function stateWord(s: ScreenState): string {
  if (s.state === "busy") return `${s.activity ?? "working"}…`;
  if (s.state === "checking") return "checking…";
  return "idle";
}

function paintStatic(ctx: Ctx2D, w: number, h: number) {
  let seed = 7;
  for (let i = 0; i < 420; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const v = 60 + (seed % 140);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(seed % w, (seed * 7) % h, 3, 2);
  }
}

function paintTube(ctx: Ctx2D, w: number, h: number) {
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
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.fillRect(x + r, y, w - 2 * r, h);
  ctx.fillRect(x, y + r, w, h - 2 * r);
  for (const [cx, cy] of [[x + r, y + r], [x + w - r, y + r], [x + r, y + h - r], [x + w - r, y + h - r]]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
}

const MASCOT: Record<Exclude<TvMood, "offline">, { body: string; visor: string }> = {
  working: { body: "#c9ced6", visor: "#2a3340" }, reviewing: { body: "#e8c7a8", visor: "#2a3340" },
  idle: { body: "#9aa3ad", visor: "#2a3340" }, stuck: { body: "#ef9f27", visor: "#3c3489" },
};

// The shelf's mascot, drawn: two ears, a rounded head, a dark visor and eyes that show the mood.
function paintMascot(ctx: Ctx2D, cx: number, cy: number, size: number, mood: Exclude<TvMood, "offline">, look: number, blink: boolean) {
  const { body, visor } = MASCOT[mood];
  ctx.strokeStyle = body;
  ctx.lineWidth = size * 0.09;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * size * 0.3, cy - size * 0.3);
    ctx.lineTo(cx + side * size * 0.22, cy - size * 0.56);
    ctx.lineTo(cx + side * size * 0.13, cy - size * 0.32);
    ctx.stroke();
  }
  ctx.fillStyle = body;
  roundRect(ctx, cx - size * 0.45, cy - size * 0.36, size * 0.9, size * 0.86, size * 0.36);
  ctx.fillStyle = visor;
  roundRect(ctx, cx - size * 0.34, cy - size * 0.12, size * 0.68, size * 0.42, size * 0.17);
  const eye = size * 0.09;
  const ey = cy + size * 0.09;
  const shift = Math.max(-1, Math.min(1, look)) * eye * 0.5;
  ctx.strokeStyle = "#e8f0ff";
  ctx.fillStyle = "#e8f0ff";
  ctx.lineWidth = Math.max(2, size * 0.04);
  for (const side of [-1, 1]) {
    const ex = cx + side * size * 0.16 + shift;
    ctx.beginPath();
    if (mood === "idle") ctx.arc(ex, ey - eye * 0.3, eye, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (blink || (mood === "reviewing" && side < 0)) { ctx.moveTo(ex - eye, ey); ctx.lineTo(ex + eye, ey); }
    else ctx.arc(ex, ey, mood === "stuck" ? eye * 0.75 : eye, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  if (mood === "reviewing") {
    ctx.strokeStyle = "#ef9f27";
    ctx.lineWidth = Math.max(2, size * 0.03);
    ctx.beginPath(); ctx.arc(cx + size * 0.16 + shift, ey, eye * 1.45, 0, Math.PI * 2); ctx.stroke();
  } else if (mood === "idle") {
    ctx.font = `${Math.round(size * 0.16)}px monospace`;
    ctx.fillText("z", cx + size * 0.5, cy - size * 0.32);
    ctx.font = `${Math.round(size * 0.11)}px monospace`;
    ctx.fillText("z", cx + size * 0.6, cy - size * 0.46);
  } else if (mood === "stuck") {
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(size * 0.3)}px monospace`;
    ctx.fillText("!", cx - size * 0.58, cy - size * 0.18);
  }
}

const BUG_DOT: Record<TvStatus["bug"], string> = { LIVE: "#e24b4a", WAIT: "#ef9f27", IDLE: "#888780", OFF: "#5f5e5a" };
const SCREEN_BG: Record<TvMood, string> = { working: "#1b2430", reviewing: "#1b2430", idle: "#151515", stuck: "#2b1a10", offline: "#0d0f0c" };

// The shelf's broadcast look: channel bug and LIVE light on top, the mascot (beside the job graphic while it works),
// and a lower third: the headline banner over a line of detail.
function paintStatus(ctx: Ctx2D, w: number, h: number, s: ScreenState, st: TvStatus) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = SCREEN_BG[st.mood];
  ctx.fillRect(0, 0, w, h);
  if (st.mood === "offline") paintStatic(ctx, w, h);
  else if (s.graphic) {
    const box = { x: w * 0.47, y: h * 0.15, w: w * 0.47, h: h * 0.52 };
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    paintGraphic(ctx, box, s);
    paintMascot(ctx, w * 0.25, h * 0.46, h * 0.46, st.mood, s.look ?? 0, Boolean(s.blink));
  } else paintMascot(ctx, w / 2, h * 0.46, h * 0.46, st.mood, s.look ?? 0, Boolean(s.blink));
  paintTube(ctx, w, h);
  const small = Math.round(h / 16);
  ctx.font = `${small}px monospace`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(st.channel, w * 0.06, h * 0.11);
  ctx.textAlign = "right";
  ctx.fillText(st.bug, w * 0.94, h * 0.11);
  ctx.fillStyle = BUG_DOT[st.bug];
  ctx.beginPath(); ctx.arc(w * 0.94 - small * 3.1, h * 0.11 - small * 0.35, small * 0.32, 0, Math.PI * 2); ctx.fill();
  // Lower third: the banner hugs its headline (monospace, about 0.62 of the font size per character).
  const big = Math.round(h / 13);
  const headline = st.headline.slice(0, 24);
  ctx.fillStyle = st.banner;
  ctx.fillRect(w * 0.04, h * 0.72, Math.min(w * 0.92, headline.length * big * 0.62 + big), h * 0.1);
  ctx.fillStyle = "#f1efe8";
  ctx.fillRect(w * 0.04, h * 0.82, w * 0.92, h * 0.1);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${big}px monospace`;
  ctx.fillText(headline, w * 0.04 + big * 0.5, h * 0.795);
  ctx.fillStyle = "#2c2c2a";
  ctx.font = `${small}px monospace`;
  ctx.fillText(st.sub.slice(0, 40), w * 0.04 + big * 0.5, h * 0.89);
}

// Draws one CRT screen: scanlines, the agent's eye, name, roles and state. Deterministic, so it is testable.
export function paintScreen(ctx: Ctx2D, w: number, h: number, s: ScreenState): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0d0f0c";
  ctx.fillRect(0, 0, w, h);
  if (s.status && !s.mini) {
    paintStatus(ctx, w, h, s, s.status);
    return;
  }
  if (s.state === "offline") {
    paintStatic(ctx, w, h);
    ctx.fillStyle = "#f3e6cf";
    ctx.font = `bold ${Math.round(h / 8)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("NO SIGNAL", w / 2, h / 2);
    return;
  }
  paintTube(ctx, w, h);
  if (s.graphic && !s.mini) {
    paintGraphic(ctx, { x: 0, y: 0, w, h }, s);
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
