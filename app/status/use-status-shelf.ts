"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { isStatusShelfResponse, type StatusShelfResponse } from "./shelf-contract";
import {
  getPollingDelay,
  INITIAL_STATUS_SHELF_STATE,
  statusShelfReducer,
} from "./shelf-runtime";

const SHELF_ENDPOINT = "/api/status/shelf";

function errorMessage(response: Response): string {
  if (response.status === 503) return "Status Shelf is not configured on this Hub.";
  return "Status authority is temporarily unavailable.";
}

export function useStatusShelf() {
  const [state, dispatch] = useReducer(statusShelfReducer, INITIAL_STATUS_SHELF_STATE);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: "loading" });

    try {
      const response = await fetch(SHELF_ENDPOINT, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        dispatch({ type: "failure", error: errorMessage(response) });
        return;
      }

      const payload: unknown = await response.json();
      if (!isStatusShelfResponse(payload)) {
        dispatch({ type: "failure", error: "Status authority returned an unsupported snapshot." });
        return;
      }

      dispatch({ type: "success", snapshot: payload as StatusShelfResponse, receivedAt: Date.now() });
    } catch {
      dispatch({ type: "failure", error: "Status authority is temporarily unavailable." });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
      clearTimer();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [poll]);

  return { ...state, refresh: poll };
}
