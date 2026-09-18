export type ServiceState = "idle" | "working" | "stuck" | "offline";

export type ServiceType = "agent" | "assistant" | "bot" | "vision" | "provider";

export interface StatusActivity {
  kind: string;
  label?: string;
  startedAt?: string;
  progress?: number;
}

export interface StatusIssue {
  code: string;
  message?: string;
  retryable?: boolean;
}

export interface ShelfServiceStatus {
  serviceId: string;
  instanceId: string;
  serviceType: ServiceType;
  state: ServiceState;
  stateSince: string;
  lastHeartbeatAt: string;
  staleAfterSeconds: number;
  activity?: StatusActivity | null;
  issue?: StatusIssue | null;
  provider?: Record<string, unknown> | null;
  capabilities?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface StatusShelfResponse {
  schemaVersion: 1;
  generatedAt: string;
  services: ShelfServiceStatus[];
}

const STATES = new Set<ServiceState>(["idle", "working", "stuck", "offline"]);
const SERVICE_TYPES = new Set<ServiceType>(["agent", "assistant", "bot", "vision", "provider"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isService(value: unknown): value is ShelfServiceStatus {
  if (!isRecord(value)) return false;

  return (
    typeof value.serviceId === "string" &&
    typeof value.instanceId === "string" &&
    typeof value.serviceType === "string" &&
    SERVICE_TYPES.has(value.serviceType as ServiceType) &&
    typeof value.state === "string" &&
    STATES.has(value.state as ServiceState) &&
    typeof value.stateSince === "string" &&
    typeof value.lastHeartbeatAt === "string" &&
    typeof value.staleAfterSeconds === "number"
  );
}

export function isStatusShelfResponse(value: unknown): value is StatusShelfResponse {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.generatedAt === "string" &&
    Array.isArray(value.services) &&
    value.services.every(isService)
  );
}
