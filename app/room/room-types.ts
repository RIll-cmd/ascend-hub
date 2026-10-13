export type AgentId = "codex" | "claude" | "agy";
export const AGENT_IDS: AgentId[] = ["codex", "claude", "agy"];
export const AGENT_NAMES: Record<AgentId, string> = { codex: "Codex", claude: "Claude", agy: "Antigravity" };

export type Roles = { orchestrator: AgentId; coders: AgentId[]; reviewer: AgentId | null };
export const DEFAULT_ROLES: Roles = { orchestrator: "codex", coders: ["claude", "agy"], reviewer: null };

export type Stage = "discuss" | "roles" | "gate-roles" | "plan" | "gate-plan" | "build" | "finish" | "gate-result"
  | "opening" | "critique" | "verdict" | "done" | "rejected" | "stopped";
export type SessionMode = "build" | "debate";
export const TERMINAL_STAGES: Stage[] = ["done", "rejected", "stopped"];
export const BOARD_STAGES: Stage[] = ["build", "finish", "gate-result", "done", "rejected", "stopped"];

export type TaskStatus = "pending" | "running" | "review" | "done" | "skipped";
export type PlanTask = { id: number; title: string; assignee: AgentId; description: string; status: TaskStatus; attempts: number; commit: string | null; notes: string };
export type Message = { at: string; from: AgentId | "room"; text: string };
export type Availability = { state: "checking" | "ready" | "offline"; detail?: string };
export type RoomStatus = { online: true; agents: Record<AgentId, Availability>; folders?: string[] };

export type SessionView = {
  id: string;
  mode?: SessionMode;
  judge?: AgentId;
  answer?: string | null;
  project: string;
  projectDir: string;
  task: string;
  stage: Stage;
  roles: Roles | null;
  plan: { tasks: PlanTask[] } | null;
  pause: { reason: string; at: string } | null;
  active: { agent: AgentId; activity: string; since: string } | null;
  transcript: Message[];
};

export function rolesOf(agent: AgentId, roles: Roles | null): string[] {
  if (!roles) return [];
  return [
    roles.orchestrator === agent ? "orchestrator" : null,
    roles.coders.includes(agent) ? "coder" : null,
    roles.reviewer === agent ? "reviewer" : null,
  ].filter((role): role is string => role !== null);
}
