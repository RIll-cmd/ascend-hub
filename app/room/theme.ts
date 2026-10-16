// Neobrutalist colour themes for the Agent Room. Each id has a [data-theme] block in room.css; "wood" is the base.
export const THEMES = [
  { id: "wood", name: "Dark wood" },
  { id: "sky", name: "Sky" },
  { id: "lime", name: "Lime" },
  { id: "saas", name: "Retro SaaS" },
  { id: "admin", name: "BrutAdmin" },
  { id: "stack", name: "Brutstack" },
  { id: "flux", name: "Neoflux" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "ascend-room-theme";
const listeners = new Set<() => void>();

// The chosen theme, per browser; like the sound switch it is a convenience, so storage errors fall back quietly.
export const themePref = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get(): ThemeId {
    try {
      const saved = localStorage.getItem(KEY);
      return THEMES.find(t => t.id === saved)?.id ?? "wood";
    } catch {
      return "wood";
    }
  },
  set(id: ThemeId) {
    try { localStorage.setItem(KEY, id); } catch { /* private mode: keep it for this page only */ }
    listeners.forEach(listener => listener());
  },
};
