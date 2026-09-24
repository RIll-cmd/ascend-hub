import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import type { ShelfTvAssignment } from "./shelf-tv-assignment";
import { getStatusPresentation, safeStatusText } from "./status-presentation";

export interface AgentAuxiliarySignal {
  label: string;
  value: string;
  tone: "normal" | "positive" | "warning" | "muted";
}

export interface AgentAuxiliaryModel {
  headingId: string;
  channel: ShelfTvAssignment["channel"];
  serviceLabel: string;
  stateLabel: string;
  stateSymbol: string;
  detail: string;
  signalLabel: "LIVE" | "STALE" | "NO SIGNAL" | "CONNECTING";
  signals: AgentAuxiliarySignal[];
  copyText: string;
}

export interface AgentAuxiliaryModelInput {
  assignment: ShelfTvAssignment;
  service: ShelfServiceStatus | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  nowMs: number;
}

const SERVICE_LABELS: Record<ShelfTvAssignment["serviceId"], string> = {
  "ascend-core": "ASCEND CORE / AIRA",
  "ascend-vision": "ASCEND VISION",
  "codex-cli": "CODEX CLI",
  "antigravity-cli": "ANTIGRAVITY CLI",
};

function relativeAge(iso: string | undefined, nowMs: number): string {
  if (!iso) return "UNKNOWN";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "UNKNOWN";
  const seconds = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (seconds < 60) return `${seconds}S AGO`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}H AGO`;
  return `${Math.floor(seconds / 86_400)}D AGO`;
}

function clampProgress(progress: number | undefined): number | null {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  return Math.round(Math.min(100, Math.max(0, progress)));
}

function noServiceModel(input: AgentAuxiliaryModelInput): AgentAuxiliaryModel {
  const serviceLabel = SERVICE_LABELS[input.assignment.serviceId];
  const signalLabel = input.loading ? "CONNECTING" : "NO SIGNAL";
  const detail = input.loading
    ? "OPENING STATUS CHANNEL"
    : input.error
      ? "STATUS AUTHORITY UNAVAILABLE"
      : "NO INSTANCE REPORTED";
  const signals: AgentAuxiliarySignal[] = [
    { label: "STATUS FEED", value: signalLabel, tone: input.loading ? "normal" : "warning" },
  ];

  return {
    headingId: `agent-console-${input.assignment.serviceId}`,
    channel: input.assignment.channel,
    serviceLabel,
    stateLabel: signalLabel,
    stateSymbol: "·",
    detail,
    signalLabel,
    signals,
    copyText: [
      `${serviceLabel} · ${input.assignment.channel}`,
      `STATE: ${signalLabel}`,
      `DETAIL: ${detail}`,
    ].join("\n"),
  };
}

export function buildAgentAuxiliaryModel(input: AgentAuxiliaryModelInput): AgentAuxiliaryModel {
  const { assignment, service, stale, nowMs } = input;
  if (!service) return noServiceModel(input);

  const serviceLabel = SERVICE_LABELS[assignment.serviceId];
  const presentation = getStatusPresentation(service);
  const stateLabel = presentation.label.toUpperCase();
  const heartbeatAge = relativeAge(service.lastHeartbeatAt, nowMs);
  const activity = safeStatusText(service.activity?.label ?? service.activity?.kind, 80);
  const issue = safeStatusText(service.issue?.message ?? service.issue?.code, 80);
  const instance = safeStatusText(service.instanceId, 48) ?? "UNKNOWN";
  const detail = service.state === "working"
    ? activity ?? "OPERATION ACTIVE"
    : service.state === "stuck"
      ? issue ?? "ATTENTION REQUIRED"
      : service.state === "offline"
        ? `LAST CONTACT ${heartbeatAge}`
        : "HEARTBEAT CONFIRMED";
  const progress = clampProgress(service.activity?.progress);
  const signals: AgentAuxiliarySignal[] = [
    { label: "STATE SINCE", value: relativeAge(service.stateSince, nowMs), tone: "normal" },
    { label: "LAST HEARTBEAT", value: heartbeatAge, tone: service.state === "offline" ? "warning" : "positive" },
  ];

  if (service.activity?.startedAt) {
    signals.push({ label: "ACTIVITY", value: relativeAge(service.activity.startedAt, nowMs), tone: "normal" });
  }
  if (progress !== null) {
    signals.push({ label: "PROGRESS", value: `${progress}%`, tone: "positive" });
  }
  if (service.issue?.retryable !== undefined) {
    signals.push({
      label: "RETRY",
      value: service.issue.retryable ? "AVAILABLE" : "MANUAL REVIEW",
      tone: service.issue.retryable ? "positive" : "warning",
    });
  }
  signals.push({ label: "INSTANCE", value: instance, tone: "muted" });

  const signalLabel = stale ? "STALE" : "LIVE";
  const copyText = [
    `${serviceLabel} · ${assignment.channel}`,
    `STATE: ${stateLabel}`,
    `DETAIL: ${detail}`,
    `SIGNAL: ${signalLabel}`,
    ...signals.map(signal => `${signal.label}: ${signal.value}`),
  ].join("\n");

  return {
    headingId: `agent-console-${assignment.serviceId}`,
    channel: assignment.channel,
    serviceLabel,
    stateLabel,
    stateSymbol: presentation.symbol,
    detail,
    signalLabel,
    signals,
    copyText,
  };
}
