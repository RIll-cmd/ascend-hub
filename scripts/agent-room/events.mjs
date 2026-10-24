// Turns the CLIs' JSON stream lines into the few sub-agent facts the room shows.

export function parseJsonLine(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function subagentEvent(agentId, event) {
  if (agentId === 'claude' && event.type === 'system') {
    if (event.subtype === 'task_started') return { kind: 'started', id: event.task_id, label: `${event.description} (${event.subagent_type})` };
    if (event.subtype === 'task_progress') return { kind: 'progress', id: event.task_id, label: event.description, tool: event.last_tool_name };
    if (event.subtype === 'task_updated' && event.patch?.status) return { kind: 'finished', id: event.task_id, status: event.patch.status };
  }
  // Codex's exec stream does not say what it spawned, only when it waits on sub-agents.
  if (agentId === 'codex' && event.item?.type === 'collab_tool_call' && event.item.tool === 'wait') {
    if (event.type === 'item.started') return { kind: 'waiting' };
    if (event.type === 'item.completed') return { kind: 'waited' };
  }
  return null;
}

// Tokens (and cost, when the CLI reports it) for one finished turn; Antigravity reports tokens only.
export function usageEvent(agentId, event) {
  if (agentId === 'claude' && event.type === 'result' && event.usage) {
    const u = event.usage;
    const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    return { tokens, costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null };
  }
  if (agentId === 'codex' && event.type === 'turn.completed' && event.usage) {
    const u = event.usage;
    return { tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0), costUsd: null };
  }
  if (agentId === 'agy' && event.event === 'result' && event.result?.usage) {
    const u = event.result.usage;
    return { tokens: u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0), costUsd: null };
  }
  return null;
}

// A file inside .ascend/skills/<id>/ (either slash, JSON-escaped or not); a bare listing of the folder does not count.
const SKILL_FILE = /\.ascend[\\/]+skills[\\/]+([a-z0-9][a-z0-9-]{0,63})[\\/]+[^\s"'\\/]/g;

// The skills an agent opened in one stream event. Only tool calls (Claude, Antigravity) and shell commands (Codex) count,
// never what the agent says.
export function skillReads(agentId, event) {
  let parts = [];
  if (agentId === 'claude' && event.type === 'assistant') {
    parts = (event.message?.content ?? []).filter(b => b?.type === 'tool_use').map(b => JSON.stringify(b.input ?? {}));
  }
  if (agentId === 'codex' && event.item?.type === 'command_execution' && typeof event.item.command === 'string') parts = [event.item.command];
  if (agentId === 'agy' && event.event === 'step_update' && event.step_update?.step_type === 'tool') parts = [JSON.stringify(event.step_update.tool_info?.parameters ?? {})];
  return [...new Set(parts.flatMap(p => [...p.matchAll(SKILL_FILE)].map(m => m[1])))];
}

// The shell commands an agent starts in one stream event: Claude's Bash calls, Codex's command executions, Antigravity's tool commands.
// shortcut: Antigravity's tool parameter names are unverified, so any string parameter whose name contains "command" counts.
export function shellCommands(agentId, event) {
  if (agentId === 'claude' && event.type === 'assistant') {
    return (event.message?.content ?? []).filter(b => b?.type === 'tool_use' && b.name === 'Bash' && typeof b.input?.command === 'string').map(b => b.input.command);
  }
  if (agentId === 'codex' && event.item?.type === 'command_execution' && typeof event.item.command === 'string') return [event.item.command];
  if (agentId === 'agy' && event.event === 'step_update' && event.step_update?.step_type === 'tool') {
    return Object.entries(event.step_update.tool_info?.parameters ?? {}).filter(([k, v]) => /command/i.test(k) && typeof v === 'string').map(([, v]) => v);
  }
  return [];
}

// A provider refusing work for now (usage or rate limit, overload), as the CLIs word it; only checked on failed turns.
// Claude Code says "You've hit your session limit · resets 11:40pm (Asia/Shanghai)" (also "weekly limit"), seen in its own logs.
export const RATE_LIMITED = /usage limit|hit your (?:\w+ )?limit|rate[ _-]?limit|too many requests|\b429\b|resource[_ ]exhausted|quota exceeded|overloaded|\b529\b/i;

// Error text a CLI reports in its stream, never what the agent writes: Claude's error result and rejected rate-limit event,
// Codex's error and turn.failed events, Antigravity's failed result.
export function errorText(agentId, event) {
  if (agentId === 'claude' && event.type === 'result' && event.is_error) return typeof event.result === 'string' ? event.result : 'error';
  if (agentId === 'claude' && event.type === 'rate_limit_event' && event.rate_limit_info?.status === 'rejected') return 'rate limit rejected';
  if (agentId === 'codex' && event.type === 'error') return String(event.message ?? 'error');
  if (agentId === 'codex' && event.type === 'turn.failed') return String(event.error?.message ?? 'turn failed');
  if (agentId === 'agy' && event.event === 'result' && event.result && event.result.status !== 'SUCCESS') return JSON.stringify(event.result.error ?? event.result.response ?? event.result.status ?? 'error');
  return null;
}

export function claudeResultText(event) {
  return event.type === 'result' && typeof event.result === 'string' ? event.result : null;
}

// The final reply in a stream: Claude's result event, or Antigravity's (only when it succeeded).
export function streamResultText(stream, event) {
  if (stream === 'claude') return claudeResultText(event);
  if (stream === 'agy' && event.event === 'result' && event.result?.status === 'SUCCESS' && typeof event.result.response === 'string') return event.result.response;
  return null;
}
