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

// Which enabled role sets each agent wears; unknown agents or sets are dropped, never a reason to re-ask.
function cleanWear(value, setIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const wear = {};
  for (const id of AGENT_IDS) {
    const sets = Array.isArray(value[id]) ? [...new Set(value[id].filter(s => setIds.includes(s)))] : [];
    if (sets.length) wear[id] = sets;
  }
  return Object.keys(wear).length ? wear : undefined;
}

export function validateRoles(v, setIds = []) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('Roles must be an object.');
  if (!isAgent(v.orchestrator)) return fail('orchestrator must be one of codex, claude, agy.');
  if (!Array.isArray(v.coders) || v.coders.length === 0 || !v.coders.every(isAgent) || new Set(v.coders).size !== v.coders.length) {
    return fail('coders must be a non-empty list of distinct agents (codex, claude, agy).');
  }
  const reviewer = v.reviewer ?? null;
  if (reviewer !== null && !isAgent(reviewer)) return fail('reviewer must be an agent id or null.');
  const value = { orchestrator: v.orchestrator, coders: [...v.coders], reviewer, options: cleanOptions(v.options) };
  const wear = cleanWear(v.wear, setIds);
  if (wear) value.wear = wear;
  return { ok: true, value };
}

export function validatePlan(v, coders, setIds = []) {
  if (!v || !Array.isArray(v.tasks) || v.tasks.length < 1 || v.tasks.length > 20) return fail('tasks must be a list of 1 to 20 tasks.');
  const tasks = [];
  for (const [index, task] of v.tasks.entries()) {
    const n = index + 1;
    if (!task || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120) return fail(`Task ${n} needs a title of at most 120 characters.`);
    if (typeof task.description !== 'string' || task.description.length > 2000) return fail(`Task ${n} needs a description of at most 2000 characters.`);
    if (!coders.includes(task.assignee)) return fail(`Task ${n} assignee must be one of the coders: ${coders.join(', ')}.`);
    const clean = { id: n, title: task.title.replace(/\s+/g, ' ').trim(), assignee: task.assignee, description: task.description.trim() };
    if (task.role !== undefined && task.role !== null) {
      if (!setIds.includes(task.role)) return fail(`Task ${n} role must be one of the enabled role sets${setIds.length ? `: ${setIds.join(', ')}` : ' (none are on, so leave role out)'}.`);
      clean.role = task.role;
    }
    // A race needs rivals: every coder attempts the task and the best attempt is kept.
    if (task.race === true && coders.length > 1) clean.race = true;
    // Only earlier tasks, so the order is always valid and there can be no cycle.
    if (task.after !== undefined && task.after !== null) {
      if (!Array.isArray(task.after) || !task.after.every(d => Number.isInteger(d) && d >= 1 && d < n)) return fail(`Task ${n} after may only list earlier task numbers.`);
      if (task.after.length) clean.after = [...new Set(task.after)].sort((a, b) => a - b);
    }
    tasks.push(clean);
  }
  return { ok: true, value: { tasks, options: cleanOptions(v.options) } };
}

export function validateVerdict(v) {
  if (!v || !['ok', 'changes'].includes(v.verdict)) return fail('verdict must be "ok" or "changes".');
  return { ok: true, value: { verdict: v.verdict, notes: typeof v.notes === 'string' ? v.notes.slice(0, 4000) : '' } };
}

export function validateJudge(v, agents) {
  if (!agents.includes(v?.winner)) return fail(`winner must be one of ${agents.join(', ')}.`);
  return { ok: true, value: { winner: v.winner, reason: typeof v.reason === 'string' ? v.reason.replace(/\s+/g, ' ').trim().slice(0, 500) : '' } };
}

export function validateReassign(v, coders, current) {
  if (v?.action === 'skip') return { ok: true, value: { action: 'skip' } };
  if (v?.action === 'reassign' && coders.includes(v.to) && v.to !== current) return { ok: true, value: { action: 'reassign', to: v.to } };
  return fail(`action must be "skip" or "reassign" to a different coder (${coders.join(', ')}).`);
}
