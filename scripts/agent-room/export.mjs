import { splitProposal } from './memory.mjs';
import { AGENT_NAMES } from './prompts.mjs';

const who = id => (id === 'room' ? 'Room' : AGENT_NAMES[id] ?? id);
const names = ids => ids.map(who).join(', ');

function rolesLine(roles) {
  if (!roles) return null;
  return [`orchestrator ${who(roles.orchestrator)}`, `coders ${names(roles.coders)}`, roles.reviewer ? `reviewer ${who(roles.reviewer)}` : 'no reviewer'].join(', ');
}

function usageLine(usage = {}) {
  const parts = Object.entries(usage).filter(([, u]) => u?.turns).map(([agent, u]) =>
    `${who(agent)} ${u.turns} turn${u.turns === 1 ? '' : 's'}, ${u.tokens.toLocaleString('en-US')} tokens${u.costUsd ? `, $${u.costUsd.toFixed(2)}` : ''}`);
  return parts.length ? parts.join('; ') : null;
}

function taskLine(t) {
  const facts = [t.status, t.commit && `commit ${t.commit}`, t.check && (t.check.ok ? 'checks passed' : 'checks failed'), t.attempts && `${t.attempts} failed attempt${t.attempts === 1 ? '' : 's'}`];
  return `${t.id}. **${t.title}** (${t.race ? 'raced' : who(t.assignee)}${t.role ? `, ${t.role}` : ''}): ${facts.filter(Boolean).join(', ')}`;
}

// The orchestrator's closing summary, once the build reached the result gate; its memory json block is left out.
function summaryOf(state, transcript) {
  if (state.mode === 'debate' || !state.stageLog?.some(s => s.stage === 'gate-result')) return null;
  const final = transcript.findLast(m => m.from === state.roles?.orchestrator);
  return final ? splitProposal(final.text).summary : null;
}

// One session as a Markdown document: facts, task, plan, summary or verdict, then every message in order.
export function sessionMarkdown(state, transcript) {
  const meta = [
    ['Session', `${state.id} · ${state.mode === 'debate' ? 'debate' : state.template ?? 'feature'} · ${state.stage}`],
    ['Started', state.createdAt],
    ['Project', state.project],
    ['Folder', state.repo ? `${state.repo.dir}, branch ${state.repo.branch} from ${state.repo.baseBranch} (${state.repo.base})` : state.projectDir],
    ['Pull request', state.repo?.prUrl],
    ['GitHub issue', state.issue && `#${state.issue.number} ${state.issue.title} (${state.issue.url})`],
    ['Reviewed pull request', state.pr && `#${state.pr.number} ${state.pr.title} (${state.pr.url})${state.pr.posted ? `, verdict posted ${state.pr.posted}` : ''}`],
    ['Judge', state.mode === 'debate' && who(state.judge)],
    ['Roles', rolesLine(state.roles)],
    ['Checks', state.check && `\`${state.check}\``],
    ['Usage', usageLine(state.usage)],
  ].filter(([, v]) => v);
  const summary = summaryOf(state, transcript);
  return [
    `# ${String(state.task ?? '').split('\n')[0].slice(0, 120) || state.project}`,
    '',
    ...meta.map(([k, v]) => `- **${k}:** ${v}`),
    '',
    state.mode === 'debate' ? '## Question' : '## Task',
    '',
    String(state.task ?? '').trim(),
    ...(state.plan?.tasks?.length ? ['', '## Plan', '', ...state.plan.tasks.map(taskLine)] : []),
    ...(summary ? ['', '## Summary', '', summary] : []),
    ...(state.answer ? ['', '## Verdict', '', state.answer.trim()] : []),
    '',
    `## Transcript (${transcript.length} message${transcript.length === 1 ? '' : 's'})`,
    ...transcript.flatMap(m => ['', `### ${m.at.slice(0, 16).replace('T', ' ')} UTC · ${who(m.from)}${m.to?.length ? ` to ${names(m.to)}` : ''}`, '', String(m.text).trim()]),
    '',
  ].join('\n');
}
