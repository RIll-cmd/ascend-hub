export const AGENT_IDS = ['codex', 'claude', 'agy'];

const fail = error => ({ ok: false, error });
const isAgent = value => AGENT_IDS.includes(value);

export const isReady = text => /\[READY\]/.test(String(text));

// Suggested changes an agent offers with roles or a plan; a bad entry is dropped, never a reason to re-ask.
export const cleanOptions = v => (Array.isArray(v) ? v : [])
  .filter(o => typeof o === 'string' && o.trim() && o.length <= 160).map(o => o.replace(/\s+/g, ' ').trim()).slice(0, 4);

export function extractJsonBlock(text) {
  const blocks = [...String(text).matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (blocks.length === 0) return fail('No ```json block found.');
  try {
    return { ok: true, value: JSON.parse(blocks.at(-1)[1]) };
  } catch (error) {
    return fail(`The json block is not valid JSON: ${error.message}`);
  }
}

export function validateRoles(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('Roles must be an object.');
  if (!isAgent(v.orchestrator)) return fail('orchestrator must be one of codex, claude, agy.');
  if (!Array.isArray(v.coders) || v.coders.length === 0 || !v.coders.every(isAgent) || new Set(v.coders).size !== v.coders.length) {
    return fail('coders must be a non-empty list of distinct agents (codex, claude, agy).');
  }
  const reviewer = v.reviewer ?? null;
  if (reviewer !== null && !isAgent(reviewer)) return fail('reviewer must be an agent id or null.');
  return { ok: true, value: { orchestrator: v.orchestrator, coders: [...v.coders], reviewer, options: cleanOptions(v.options) } };
}

export function validatePlan(v, coders) {
  if (!v || !Array.isArray(v.tasks) || v.tasks.length < 1 || v.tasks.length > 20) return fail('tasks must be a list of 1 to 20 tasks.');
  const tasks = [];
  for (const [index, task] of v.tasks.entries()) {
    const n = index + 1;
    if (!task || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120) return fail(`Task ${n} needs a title of at most 120 characters.`);
    if (typeof task.description !== 'string' || task.description.length > 2000) return fail(`Task ${n} needs a description of at most 2000 characters.`);
    if (!coders.includes(task.assignee)) return fail(`Task ${n} assignee must be one of the coders: ${coders.join(', ')}.`);
    tasks.push({ id: n, title: task.title.replace(/\s+/g, ' ').trim(), assignee: task.assignee, description: task.description.trim() });
  }
  return { ok: true, value: { tasks, options: cleanOptions(v.options) } };
}

export function validateVerdict(v) {
  if (!v || !['ok', 'changes'].includes(v.verdict)) return fail('verdict must be "ok" or "changes".');
  return { ok: true, value: { verdict: v.verdict, notes: typeof v.notes === 'string' ? v.notes.slice(0, 4000) : '' } };
}

export function validateReassign(v, coders, current) {
  if (v?.action === 'skip') return { ok: true, value: { action: 'skip' } };
  if (v?.action === 'reassign' && coders.includes(v.to) && v.to !== current) return { ok: true, value: { action: 'reassign', to: v.to } };
  return fail(`action must be "skip" or "reassign" to a different coder (${coders.join(', ')}).`);
}
