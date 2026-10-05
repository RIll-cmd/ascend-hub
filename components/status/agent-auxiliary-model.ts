import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import type { ShelfTvAssignment } from "./shelf-tv-assignment";
import { deriveShelfTvPresentation, getStatusPresentation, safeStatusText, statusReportAgeMs, type ShelfTvPresentation } from "./status-presentation";

export interface AgentAuxiliarySignal {
  label: string;
  value: string;
  tone: "normal" | "positive" | "warning" | "muted";
}

export interface AgentAuxiliaryModel {
  presentation: ShelfTvPresentation;
  headingId: string;
  channel: ShelfTvAssignment["channel"];
  serviceLabel: string;
  stateLabel: string;
  stateSymbol: string;
  detail: string;
  signalLabel: "LIVE" | "STALE" | "NO SIGNAL" | "CONNECTING";
  signals: AgentAuxiliarySignal[];
  copyText: string;
  activity?: string | null;
  issue?: string | null;
  progress?: number | null;
  retryable?: boolean;
}

export interface AgentAuxiliaryModelInput {
  assignment: ShelfTvAssignment;
  service: ShelfServiceStatus | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  nowMs: number;
  selectedInstanceId?: string | null;
  presentation?: ShelfTvPresentation;
}

const SERVICE_LABELS: Record<ShelfTvAssignment["serviceId"], string> = {
  "ascend-core": "ASCEND CORE / AIRA",
  "ascend-vision": "ASCEND VISION",
  "codex-cli": "CODEX CLI",
  "antigravity-cli": "ANTIGRAVITY CLI",
};

function relativeAge(iso: string | undefined, nowMs: number): string {
  if (!iso) return "UNKNOWN";
  const ageMs = statusReportAgeMs(iso, nowMs);
  if (ageMs === null) return "UNKNOWN";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}S AGO`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}H AGO`;
  return `${Math.floor(seconds / 86_400)}D AGO`;
}

function clampProgress(progress: number | undefined): number | null {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  return Math.round(Math.min(100, Math.max(0, progress)));
}

function noServiceModel(input: AgentAuxiliaryModelInput, presentation: ShelfTvPresentation): AgentAuxiliaryModel {
  const serviceLabel = SERVICE_LABELS[input.assignment.serviceId];
  const signalLabel = presentation.freshness === "loading" ? "CONNECTING" : "NO SIGNAL";
  const detail = presentation.freshness === "loading"
    ? "OPENING STATUS CHANNEL"
    : input.error
      ? "STATUS AUTHORITY UNAVAILABLE"
      : "NO INSTANCE REPORTED";
  const instance = safeStatusText(input.selectedInstanceId, 48);
  const signals: AgentAuxiliarySignal[] = instance ? [{ label: "INSTANCE", value: instance, tone: "muted" }] : [];

  return {
    presentation,
    headingId: `agent-console-${input.assignment.serviceId}`,
    channel: input.assignment.channel,
    serviceLabel,
    stateLabel: presentation.heading.toUpperCase(),
    stateSymbol: "·",
    detail,
    signalLabel,
    signals,
    copyText: [
      `${serviceLabel} · ${input.assignment.channel}`,
      `STATE: ${presentation.heading}`,
      `DETAIL: ${presentation.explanation}`,
      ...signals.map(signal => `${signal.label}: ${signal.value}`),
    ].join("\n"),
  };
}

export function buildAgentAuxiliaryModel(input: AgentAuxiliaryModelInput): AgentAuxiliaryModel {
  const { assignment, service, nowMs } = input;
  const tvPresentation = input.presentation ?? deriveShelfTvPresentation(input);
  if (!service) return noServiceModel(input, tvPresentation);

  const serviceLabel = SERVICE_LABELS[assignment.serviceId];
  const presentation = getStatusPresentation(service);
  const stateLabel = tvPresentation.heading.toUpperCase();
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
        : tvPresentation.freshness === "current" ? "HEARTBEAT CONFIRMED" : "LAST KNOWN IDLE";
  const progress = clampProgress(service.activity?.progress);
  const signals: AgentAuxiliarySignal[] = [
    { label: "STATE SINCE", value: relativeAge(service.stateSince, nowMs), tone: "normal" },
    { label: "LAST HEARTBEAT", value: heartbeatAge, tone: service.state === "offline" || tvPresentation.freshness !== "current" ? "warning" : "positive" },
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

  const signalLabel = tvPresentation.freshness === "current" ? "LIVE" : "STALE";
  const copyText = [
    `${serviceLabel} · ${assignment.channel}`,
    `STATE: ${stateLabel}`,
    `DETAIL: ${detail}`,
    `SIGNAL: ${signalLabel}`,
    `REPORT: ${tvPresentation.explanation}`,
    ...signals.map(signal => `${signal.label}: ${signal.value}`),
  ].join("\n");

  return {
    presentation: tvPresentation,
    headingId: `agent-console-${assignment.serviceId}`,
    channel: assignment.channel,
    serviceLabel,
    stateLabel,
    stateSymbol: presentation.symbol,
    detail,
    signalLabel,
    signals,
    copyText,
    activity,
    issue,
    progress,
    retryable: service.issue?.retryable,
  };
}
