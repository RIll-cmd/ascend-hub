class ZzzSoundPlayer {
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  play(sound: "vhs_start" | "tv_static" | "radio_static" | "light_switch" | "click", volume: number = 0.6) {
    if (typeof window === "undefined") return;
    try {
      const paths: Record<string, string> = {
        vhs_start: "/sounds/zzz/vhs_startup.mp3",
        tv_static: "/sounds/zzz/tv_static.mp3",
        radio_static: "/sounds/zzz/radio_static.mp3",
        light_switch: "/sounds/zzz/light_switch.mp3",
        click: "/sounds/zzz/click.mp3",
      };

      const src = paths[sound];
      if (!src) return;

      let audio = this.audioCache.get(sound);
      if (!audio) {
        audio = new Audio(src);
        this.audioCache.set(sound, audio);
      } else {
        audio.currentTime = 0;
      }

      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => {
        // Handle autoplay policy restriction silently
      });
    } catch {
      // ignore
    }
  }
}

export const zzzAudio = new ZzzSoundPlayer();
