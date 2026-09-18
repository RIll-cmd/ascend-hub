import type { ShelfServiceStatus, ServiceState } from "../../app/status/shelf-contract";

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

export function safeStatusText(value: string | undefined, limit = 160): string | null {
  if (!value) return null;
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, limit) || null;
}
