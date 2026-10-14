import { AGENT_NAMES } from './prompts.mjs';

export const GATES = { 'gate-roles': 'roles', 'gate-plan': 'plan', 'gate-result': 'result' };

const names = ids => {
  const list = ids.map(id => AGENT_NAMES[id]);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0];
};

// What the owner is being asked, in words a voice assistant can read out; null while the agents work.
export function attention(state, transcript = []) {
  if (state.pause) return { kind: 'pause', summary: state.pause.reason, options: [], decisions: ['retry', 'stop'] };
  const gate = GATES[state.stage];
  if (!gate || state.mode === 'debate') return null;
  if (gate === 'roles') {
    const { orchestrator, coders, reviewer } = state.roles;
    const summary = `${AGENT_NAMES[orchestrator]} orchestrates. ${names(coders)} ${coders.length > 1 ? 'code' : 'codes'}.${reviewer ? ` ${AGENT_NAMES[reviewer]} reviews.` : ''}`;
    return { kind: 'gate', gate, summary, options: state.roleOptions ?? [], decisions: ['approve', 'revise'] };
  }
  if (gate === 'plan') {
    const tasks = state.plan.tasks;
    const list = tasks.map((t, i) => `${i + 1}, ${t.title}, for ${AGENT_NAMES[t.assignee]}.`).join(' ');
    const summary = `The plan has ${tasks.length} task${tasks.length === 1 ? '' : 's'}. ${list}`;
    return { kind: 'gate', gate, summary, options: state.plan.options ?? [], decisions: ['approve', 'revise'] };
  }
  const final = transcript.findLast(m => m.from === state.roles?.orchestrator);
  const text = (final?.text ?? 'The work is finished.').replace(/\s+/g, ' ').trim();
  return { kind: 'gate', gate, summary: text.length > 400 ? `${text.slice(0, 397).trimEnd()}...` : text, options: [], decisions: ['accept', 'reject'] };
}
