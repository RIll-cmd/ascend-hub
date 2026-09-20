import type { ShelfServiceStatus } from "../../app/status/shelf-contract";

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
): ShelfServiceStatus | null {
  const assignment = getShelfTvAssignment(slotId);
  if (!assignment) return null;
  return services.find((service) => service.serviceId === assignment.serviceId) ?? null;
}
