import type { ShelfServiceStatus, ServiceState } from "../../app/status/shelf-contract";
import { getSignalLossVideo, getStatusVideo, type StatusVideoPresentation } from "./status-video";

export type ShelfTvFreshness = "loading" | "current" | "stale" | "unavailable";

export interface ShelfTvPresentation {
  lifecycle: ServiceState | null;
  freshness: ShelfTvFreshness;
  video: StatusVideoPresentation | null;
  videoSource: string | null;
  heading: string;
  explanation: string;
  accessibleDescription: string;
  reportAgeMs: number | null;
}

export interface ShelfTvPresentationInput {
  service: ShelfServiceStatus | null;
  loading: boolean;
  error: string | null;
  stale?: boolean;
  nowMs: number;
  selectedInstanceId?: string | null;
}

/** Accept zoned ISO timestamps; reject Date.parse's permissive/normalized dates. */
export function validStatusTimestamp(iso: string | undefined): number | null {
  if (typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(iso);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offsetHour = "0", offsetMinute = "0"] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth) return null;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(offsetHour) > 23 || Number(offsetMinute) > 59) return null;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function statusReportAgeMs(iso: string | undefined, nowMs: number): number | null {
  const timestamp = validStatusTimestamp(iso);
  if (timestamp === null || !Number.isFinite(nowMs) || timestamp > nowMs) return null;
  return nowMs - timestamp;
}

function ageDescription(ageMs: number | null): string {
  if (ageMs === null) return "Report age cannot be verified.";
  const seconds = Math.floor(ageMs / 1_000);
  const [amount, unit] = seconds < 60 ? [seconds, "second"]
    : seconds < 3_600 ? [Math.floor(seconds / 60), "minute"]
      : seconds < 86_400 ? [Math.floor(seconds / 3_600), "hour"]
        : [Math.floor(seconds / 86_400), "day"];
  return `Latest report: ${amount} ${unit}${amount === 1 ? "" : "s"} ago.`;
}

function feedExplanation(error: string | null): string {
  // Only public client errors are allowed through; never expose arbitrary upstream text.
  switch (error) {
    case "Status Shelf is not configured on this Hub.": return error;
    case "Status authority returned an unsupported snapshot.": return "The status feed returned an unsupported snapshot.";
    case "Status request timed out.": return "The status feed request timed out.";
    default: return "Cannot reach the status feed.";
  }
}

export function deriveShelfTvPresentation(input: ShelfTvPresentationInput): ShelfTvPresentation {
  const { service, loading, error, stale, nowMs, selectedInstanceId } = input;
  if (!service) {
    const checking = loading && !error && !selectedInstanceId;
    const heading = checking ? "Checking status" : "Status unavailable";
    const explanation = checking ? "Waiting for the first status report."
      : error ? feedExplanation(error)
        : selectedInstanceId ? "The selected instance is no longer reported by the status feed."
          : "No instance reported by the status feed.";
    const video = checking ? null : getSignalLossVideo();
    return { lifecycle: null, freshness: checking ? "loading" : "unavailable", video,
      videoSource: video?.src ?? null, heading, explanation,
      accessibleDescription: `${heading}. ${explanation}`, reportAgeMs: null };
  }

  const reportAgeMs = statusReportAgeMs(service.lastHeartbeatAt, nowMs);
  const expiryMs = service.staleAfterSeconds * 1_000;
  const validExpiry = Number.isFinite(expiryMs) && expiryMs > 0;
  const current = !error && !stale && reportAgeMs !== null && validExpiry && reportAgeMs < expiryMs;
  const label = service.state === "stuck" ? "Needs attention" : STATE_PRESENTATION[service.state].label;
  const heading = current ? label : `Last known ${label.toLowerCase()}`;
  const reason = error ? feedExplanation(error)
    : reportAgeMs === null ? "The heartbeat timestamp cannot be verified."
      : !validExpiry ? "The report expiry cannot be verified."
        : !current ? "The status report is stale." : "";
  const explanation = [reason, ageDescription(reportAgeMs), service.state === "offline" ? "Offline as reported by its producer." : ""].filter(Boolean).join(" ");
  const video = getStatusVideo(service.state);
  const identity = getStatusPresentation(service);
  return { lifecycle: service.state, freshness: current ? "current" : "stale", video,
    videoSource: video?.src ?? null, heading, explanation, reportAgeMs,
    accessibleDescription: `${identity.brand}, instance ${safeStatusText(service.instanceId, 80) ?? "unknown"}. ${heading}. ${explanation}` };
}

export interface StatusPresentation {
  brand: string;
  artwork: "core" | "vision" | "generic";
  label: string;
  symbol: string;
  ariaDescription: string;
  tone: ServiceState;
}

const STATE_PRESENTATION: Record<ServiceState, Pick<StatusPresentation, "label" | "symbol">> = {
  idle: { label: "Idle", symbol: "●" },
  working: { label: "Working", symbol: "▶" },
  stuck: { label: "Stuck", symbol: "!" },
  offline: { label: "Offline", symbol: "×" },
};

const KNOWN_SERVICES: Record<string, Pick<StatusPresentation, "brand" | "artwork">> = {
  "ascend-core": { brand: "Ascend Core", artwork: "core" },
  "ascend-vision": { brand: "Ascend Vision", artwork: "vision" },
  "codex-cli": { brand: "Codex CLI", artwork: "generic" },
  "antigravity-cli": { brand: "Antigravity CLI", artwork: "generic" },
};

export function getStatusPresentation(service: ShelfServiceStatus): StatusPresentation {
  const state = STATE_PRESENTATION[service.state];
  const servicePresentation = KNOWN_SERVICES[service.serviceId] ?? {
    brand: "Generic service",
    artwork: "generic" as const,
  };

  return {
    ...servicePresentation,
    ...state,
    tone: service.state,
    ariaDescription: `${servicePresentation.brand}, instance ${service.instanceId}, ${state.label}`,
  };
}

export function safeStatusText(value: unknown, limit = 160): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, limit) || null;
}
