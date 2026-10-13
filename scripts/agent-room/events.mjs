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

export function claudeResultText(event) {
  return event.type === 'result' && typeof event.result === 'string' ? event.result : null;
}
