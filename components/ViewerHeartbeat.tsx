"use client";
import { useEffect } from "react";

// Tells the agent room every 30 s (visible or hidden) that a Hub page is open; the desktop launcher stops Hub after
// a quiet spell. Pages that never call the room otherwise (a summary, the design system) still count.
export function ViewerHeartbeat() {
  useEffect(() => {
    const beat = () => { void fetch("/api/viewer", { method: "POST", cache: "no-store" }).catch(() => {}); };
    beat();
    const timer = setInterval(beat, 30_000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
