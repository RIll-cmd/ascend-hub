import { isStatusShelfResponse, type StatusShelfResponse } from "./shelf-contract";

const UPSTREAM_TIMEOUT_MS = 5_000;

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
  error: string | null;
  lastSuccessfulAt: number | null;
  stale?: boolean;
}

export const INITIAL_STATUS_SHELF_STATE: StatusShelfClientState = {
  current: null,
  lastSuccessful: null,
  loading: true,
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
      return { ...state, loading: state.current === null, error: null };
    case "success":
      return {
        current: action.snapshot,
        lastSuccessful: action.snapshot,
        loading: false,
        error: null,
        lastSuccessfulAt: action.receivedAt,
        stale: false,
      };
    case "failure":
      return {
        ...state,
        current: state.lastSuccessful,
        loading: false,
        error: action.error,
        stale: state.lastSuccessful !== null,
      };
  }
}

export function getPollingDelay(hidden: boolean): number {
  return hidden ? 30_000 : 4_000;
}
