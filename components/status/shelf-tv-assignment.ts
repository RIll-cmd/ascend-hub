import type { ShelfServiceStatus } from "../../app/status/shelf-contract";
import { validStatusTimestamp } from "./status-presentation";

export interface ShelfTvAssignment {
  channel: "CH 01" | "CH 02" | "CH 03" | "CH 04";
  serviceId: "ascend-core" | "ascend-vision" | "codex-cli" | "antigravity-cli";
}

const SHELF_TV_ASSIGNMENTS: Readonly<Record<string, ShelfTvAssignment>> = {
  "slot-1-1-t": { channel: "CH 01", serviceId: "ascend-core" },
  "slot-1-3-t": { channel: "CH 02", serviceId: "ascend-vision" },
  "slot-1-1-b": { channel: "CH 03", serviceId: "codex-cli" },
  "slot-1-3-b": { channel: "CH 04", serviceId: "antigravity-cli" },
};

export function getShelfTvAssignment(slotId: string): ShelfTvAssignment | null {
  return SHELF_TV_ASSIGNMENTS[slotId] ?? null;
}

export function resolveShelfTvService(
  slotId: string,
  services: readonly ShelfServiceStatus[],
  selectedInstanceId?: string | null,
  nowMs = Date.now(),
): ShelfServiceStatus | null {
  const assignment = getShelfTvAssignment(slotId);
  if (!assignment) return null;
  const matches = services.filter((service) => service.serviceId === assignment.serviceId);
  if (selectedInstanceId !== undefined && selectedInstanceId !== null) {
    return matches.find((service) => service.instanceId === selectedInstanceId) ?? null;
  }
  const heartbeat = (service: ShelfServiceStatus) => {
    const timestamp = validStatusTimestamp(service.lastHeartbeatAt);
    return timestamp !== null && timestamp <= nowMs ? timestamp : -Infinity;
  };
  return matches.sort((a, b) => {
    const aHeartbeat = heartbeat(a);
    const bHeartbeat = heartbeat(b);
    if (aHeartbeat !== bHeartbeat) return aHeartbeat > bHeartbeat ? -1 : 1;
    return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
  })[0] ?? null;
}
