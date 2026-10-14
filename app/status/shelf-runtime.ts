import { isStatusShelfResponse, type StatusShelfResponse } from "./shelf-contract";

const UPSTREAM_TIMEOUT_MS = 5_000;
export const STATUS_SHELF_CLIENT_TIMEOUT_MS = 8_000;

export interface StatusShelfRequestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Bound both the fetch and body read, even when a fetch implementation ignores abort. */
export async function requestStatusShelf({
  fetchImpl = fetch,
  signal,
  timeoutMs = STATUS_SHELF_CLIENT_TIMEOUT_MS,
}: StatusShelfRequestOptions = {}): Promise<StatusShelfResponse> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const interruption = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException("Status request cancelled.", "AbortError"));
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener("abort", cancel, { once: true });
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Status request timed out."));
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : STATUS_SHELF_CLIENT_TIMEOUT_MS);
  });

  const request = async () => {
    if (controller.signal.aborted) throw new DOMException("Status request cancelled.", "AbortError");
    const response = await fetchImpl("/api/status/shelf", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(response.status === 503
        ? "Status Shelf is not configured on this Hub."
        : "Status authority is temporarily unavailable.");
    }
    const payload: unknown = await response.json();
    if (!isStatusShelfResponse(payload)) throw new Error("Status authority returned an unsupported snapshot.");
    return payload;
  };

  try {
    return await Promise.race([interruption, request()]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export interface StatusShelfProxyOptions {
  coreShelfUrl?: string;
  readCredential?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createStatusShelfProxy({
  coreShelfUrl,
  readCredential,
  fetchImpl = fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
}: StatusShelfProxyOptions) {
  return async function proxyStatusShelf(): Promise<Response> {
    if (!coreShelfUrl || !readCredential) {
      return Response.json({ error: "status_shelf_not_configured" }, { status: 503 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetchImpl(coreShelfUrl, {
        cache: "no-store",
        headers: { "X-Status-Read-Credential": readCredential },
        signal: controller.signal,
      });

      if (!upstream.ok) {
        return Response.json({ error: "status_authority_unavailable" }, { status: 502 });
      }

      const payload: unknown = await upstream.json();
      if (!isStatusShelfResponse(payload)) {
        return Response.json({ error: "status_authority_invalid_response" }, { status: 502 });
      }

      return Response.json(payload, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ error: "status_authority_unavailable" }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export interface StatusShelfClientState {
  current: StatusShelfResponse | null;
  lastSuccessful: StatusShelfResponse | null;
  loading?: boolean;
  refreshing?: boolean;
  error: string | null;
  lastSuccessfulAt: number | null;
  stale?: boolean;
}

export const INITIAL_STATUS_SHELF_STATE: StatusShelfClientState = {
  current: null,
  lastSuccessful: null,
  loading: true,
  refreshing: false,
  error: null,
  lastSuccessfulAt: null,
  stale: false,
};

export type StatusShelfAction =
  | { type: "loading" }
  | { type: "success"; snapshot: StatusShelfResponse; receivedAt: number }
  | { type: "failure"; error: string };

export function statusShelfReducer(
  state: StatusShelfClientState,
  action: StatusShelfAction,
): StatusShelfClientState {
  switch (action.type) {
    case "loading":
      return { ...state, loading: state.current === null, refreshing: true };
    case "success":
      return {
        current: action.snapshot,
        lastSuccessful: action.snapshot,
        loading: false,
        refreshing: false,
        error: null,
        lastSuccessfulAt: action.receivedAt,
        stale: false,
      };
    case "failure":
      return {
        ...state,
        current: state.lastSuccessful,
        loading: false,
        refreshing: false,
        error: action.error,
        stale: state.lastSuccessful !== null,
      };
  }
}

export function getPollingDelay(hidden: boolean): number {
  return hidden ? 30_000 : 4_000;
}
