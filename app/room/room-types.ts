export type AgentId = "codex" | "claude" | "agy";
export const AGENT_IDS: AgentId[] = ["codex", "claude", "agy"];
export const AGENT_NAMES: Record<AgentId, string> = { codex: "Codex", claude: "Claude", agy: "Antigravity" };

// wear: the role sets (frontend, security, ...) each agent wears in this session.
export type Roles = { orchestrator: AgentId; coders: AgentId[]; reviewer: AgentId | null; wear?: Partial<Record<AgentId, string[]>> };
export const DEFAULT_ROLES: Roles = { orchestrator: "codex", coders: ["claude", "agy"], reviewer: null };

export type Stage = "discuss" | "roles" | "gate-roles" | "plan" | "gate-plan" | "build" | "gate-race" | "finish" | "gate-result"
  | "opening" | "critique" | "verdict" | "done" | "rejected" | "stopped";
export type SessionMode = "build" | "debate";
export const TERMINAL_STAGES: Stage[] = ["done", "rejected", "stopped"];
export const BOARD_STAGES: Stage[] = ["build", "gate-race", "finish", "gate-result", "done", "rejected", "stopped"];

export type TaskStatus = "pending" | "running" | "review" | "done" | "skipped";
export type CheckResult = { ok: boolean; code: number | null; ms: number; output: string };
// The optional lint and coverage commands after a task's checks; information only, never blocking the task.
export type LintResult = { ok: boolean; code: number | null; ms: number; summary: string };
export type CoverageResult = { ok: boolean; ms: number; percent: number | null };
// race: every coder attempts the task in its own worktree; raced: how that went and which attempt was kept.
// pick and pending: the judge's choice and the passing attempts while the race gate waits for the owner.
export type RaceResult = { attempts: { agent: AgentId; ok: boolean; commit: string | null; why: string }[]; winner: AgentId | null; reason: string;
  pick?: AgentId; pending?: { base: string; attempts: { agent: AgentId; branch: string; commit: string; check: CheckResult | null }[] } };
export type PlanTask = { id: number; title: string; assignee: AgentId; description: string; status: TaskStatus; attempts: number; commit: string | null; notes: string; check?: CheckResult; lint?: LintResult; coverage?: CoverageResult; race?: boolean; raced?: RaceResult; after?: number[]; role?: string;
  // The skill folders each agent opened while working on or reviewing this task (Antigravity's reads are not reported).
  skillsRead?: Partial<Record<AgentId, string[]>> };
export type Message = {
  at: string; from: AgentId | "room"; text: string;
  seq?: number; to?: AgentId[]; kind?: "assign" | "subagent"; by?: AgentId; sub?: string;
  usage?: { tokens: number; costUsd: number | null };
};
export type Availability = { state: "checking" | "ready" | "offline"; detail?: string };
export type RepoChoice = { dir: string; check: string };
// An MCP server from room settings; missing lists its variables that have no value yet.
export type ConnectorChoice = { id: string; name: string; description: string; missing: string[] };
export type QuotaWindow = { usedPercent: number | null; resetsAt: string | null } | null;
export type AgentQuota = { fiveHour: QuotaWindow; weekly: QuotaWindow; seenAt?: string } | null;
export type RoomStatus = {
  online: true; agents: Record<AgentId, Availability>; folders?: string[]; repos?: RepoChoice[]; buildsRoot?: string; connectors?: ConnectorChoice[];
  quota?: Partial<Record<AgentId, AgentQuota>>; quotaWarning?: string | null;
};

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
  pause: { reason: string; at: string; kind?: "turns" | "minutes" | "rounds" | "baseline"; task?: number } | null;
  limits?: { minutes: number; turns: number; rounds: number };
  template?: "feature" | "bugfix" | "refactor";
  models?: Partial<Record<AgentId, string>>;
  turns?: number;
  workMs?: number;
  usage?: Partial<Record<AgentId, { turns: number; tokens: number; costUsd: number }>>;
  active: {
    agent: AgentId; activity: string; since: string;
    subagents?: { id: string; label: string; tool: string | null; status: string }[];
    waiting?: boolean;
  } | null;
  transcript: Message[];
  stageLog?: { stage: Stage; at: string }[];
  repo?: { dir: string; branch: string; base: string; baseBranch: string; prUrl?: string } | null;
  check?: string | null;
  lint?: string | null;
  coverage?: string | null;
  checkRuns?: CheckRun[];
  ownerNotes?: { at: string; text: string }[];
  raceGate?: boolean;
  keepGoing?: boolean;
  issue?: { number: number; title: string; url: string };
  pr?: { number: number; title: string; url: string; base: string; head: string; posted: string | null };
  raceTask?: number;
  skillProposal?: { name: string; description: string; body: string } | null;
  attention?: { kind: "gate" | "pause"; gate?: "roles" | "plan" | "race" | "result"; summary: string; options: string[]; decisions: string[]; memory?: string[] } | null;
};

export function rolesOf(agent: AgentId, roles: Roles | null): string[] {
  if (!roles) return [];
  return [
    roles.orchestrator === agent ? "orchestrator" : null,
    roles.coders.includes(agent) ? "coder" : null,
    roles.reviewer === agent ? "reviewer" : null,
  ].filter((role): role is string => role !== null);
}

// One run of the session's check command; its full output is read on demand.
export type CheckRun = { n: number; at: string; label: string; command: string; ok: boolean; code: number | null; ms: number; chars: number };
