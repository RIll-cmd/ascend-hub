"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  getPollingDelay,
  INITIAL_STATUS_SHELF_STATE,
  requestStatusShelf,
  statusShelfReducer,
} from "./shelf-runtime";

export function useStatusShelf() {
  const [state, dispatch] = useReducer(statusShelfReducer, INITIAL_STATUS_SHELF_STATE);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(false);
  const inFlight = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);

  const poll = useCallback((): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    if (inFlight.current) return inFlight.current.promise;
    const controller = new AbortController();
    dispatch({ type: "loading" });
    const promise = (async () => {
      try {
        const snapshot = await requestStatusShelf({ signal: controller.signal });
        if (mounted.current && !controller.signal.aborted) {
          const receivedAt = Date.now();
          setNowMs(receivedAt);
          dispatch({ type: "success", snapshot, receivedAt });
        }
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) {
          const message = error instanceof Error && [
            "Status Shelf is not configured on this Hub.",
            "Status authority returned an unsupported snapshot.",
            "Status request timed out.",
          ].includes(error.message) ? error.message : "Status authority is temporarily unavailable.";
          dispatch({ type: "failure", error: message });
        }
      } finally {
        if (inFlight.current?.controller === controller) inFlight.current = null;
      }
    })();
    inFlight.current = { controller, promise };
    return promise;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const updateClock = () => setNowMs(Date.now());
    const clock = setInterval(updateClock, 1_000);

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = (delay: number) => {
      clearTimer();
      timer = setTimeout(() => {
        void run();
      }, delay);
    };

    const run = async () => {
      await poll();
      if (!disposed) schedule(getPollingDelay(document.hidden));
    };

    const refreshWhenVisible = () => {
      updateClock();
      if (document.hidden) {
        schedule(getPollingDelay(true));
        return;
      }
      clearTimer();
      void run();
    };

    void run();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      disposed = true;
      mounted.current = false;
      clearTimer();
      clearInterval(clock);
      inFlight.current?.controller.abort();
      inFlight.current = null;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [poll]);

  return { ...state, nowMs, refresh: poll };
}
