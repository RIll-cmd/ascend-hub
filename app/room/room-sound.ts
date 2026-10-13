import type { SoundCue } from "./room-sound-cues";

const KEY = "agent-room-sound";
const AMBIENT_URL = "/sounds/room/ambient.mp3";
const listeners = new Set<() => void>();

// The room's own sound preference (off by default), remembered per browser.
export const soundPref = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get(): boolean { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } },
  set(on: boolean) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode: keep it for this page only */ }
    listeners.forEach(listener => listener());
  },
};

type Note = [frequency: number, start: number, duration: number, type?: OscillatorType, gain?: number];

const NOTES: Record<Exclude<SoundCue, "subagent">, Note[]> = {
  message: [[880, 0, 0.06, "sine", 0.05], [660, 0.05, 0.06, "sine", 0.04]],
  assign: [[523, 0, 0.08, "triangle", 0.06], [784, 0.09, 0.12, "triangle", 0.06]],
  attention: [[659, 0, 0.35, "sine", 0.06], [880, 0.12, 0.35, "sine", 0.05], [1047, 0.24, 0.5, "sine", 0.05]],
  verdict: [[523, 0, 0.18, "triangle", 0.06], [659, 0.14, 0.18, "triangle", 0.06], [784, 0.28, 0.18, "triangle", 0.06], [1047, 0.42, 0.45, "triangle", 0.07]],
};

class RoomSound {
  private ctx: AudioContext | null = null;
  private ambient: HTMLAudioElement | null = null;

  enable(on: boolean) {
    if (!on) {
      this.ambient?.pause();
      return;
    }
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      // Sound is optional.
    }
    if (!this.ambient) {
      this.ambient = new Audio(AMBIENT_URL);
      this.ambient.loop = true;
      this.ambient.volume = 0.22;
      this.ambient.addEventListener("error", () => { this.ambient = null; }, { once: true });
    }
    void this.ambient?.play().catch(() => {});
  }

  // The music steps back while the room waits for the owner.
  duck(on: boolean) {
    if (this.ambient) this.ambient.volume = on ? 0.08 : 0.22;
  }

  play(cue: SoundCue) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (cue === "subagent") {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.value = 2400;
      gain.gain.value = 0.12;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(now);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      return;
    }
    for (const [frequency, start, duration, type = "sine", level = 0.05] of NOTES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.linearRampToValueAtTime(level, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
}

export const roomSound = new RoomSound();
