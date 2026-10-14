"use client";

import { useEffect, useState } from "react";

// Relative ages need second precision only in an open status detail; elsewhere a slow tick keeps Home from re-rendering.
export function statusClockMs(detailOpen: boolean): number {
  return detailOpen ? 1_000 : 10_000;
}

// A poll result is as recent as "now" gets; without this a slow clock would treat a fresh heartbeat as future-dated.
export function shelfNowMs(clockMs: number, lastSuccessfulAt: number | null): number {
  return Math.max(clockMs, lastSuccessfulAt ?? 0);
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs]);
  return now;
}
