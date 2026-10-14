import { AGENT_IDS } from './parse.mjs';

export const AGENT_NAMES = { codex: 'Codex', claude: 'Claude', agy: 'Antigravity' };
export const MAX_PROMPT_CHARS = 28_000;
export const DEBATE_STAGES = new Set(['opening', 'critique', 'verdict']);

const CAPABILITIES = {
  codex: 'can edit files and run any command inside the project folder',
  claude: 'can edit files and run only node, npm, npx, git status, git diff and git log',
  agy: 'can edit files and run any command inside the project folder',
};

const cap = (text, max) => (String(text).length > max ? `${String(text).slice(0, max)}\n[truncated]` : String(text));

export function rolesOf(agent, roles) {
  if (!roles) return [];
  return [roles.orchestrator === agent && 'orchestrator', roles.coders.includes(agent) && 'coder', roles.reviewer === agent && 'reviewer'].filter(Boolean);
}

export function transcriptTail(messages, { maxMessages = 20, maxChars = 12_000 } = {}) {
  const lines = [];
  let used = 0;
  for (const message of messages.slice(-maxMessages).reverse()) {
    const line = `${message.from === 'room' ? 'ROOM' : AGENT_NAMES[message.from].toUpperCase()}: ${message.text}`;
    if (used + line.length > maxChars) {
      // Keep at least the newest message, cut to fit.
      if (lines.length === 0 && maxChars > 20) lines.unshift(`${line.slice(0, maxChars - 12)} [truncated]`);
      break;
    }
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

function stageRules(stage, agent, roles, extra) {
  const coders = roles?.coders ?? [];
  const team = coders.map(id => `- ${AGENT_NAMES[id]} (${id}) ${CAPABILITIES[id]}`).join('\n');
  switch (stage) {
    case 'discuss':
      return [
        'You are in a planning discussion with two other AI coding agents: Codex (codex), Claude (claude) and Antigravity (agy).',
        "Discuss how to build the owner's task and who should take which role:",
        '- orchestrator: plans the work, assigns tasks, writes the final summary (read-only)',
        '- coder: edits files in the project (one or more agents)',
        "- reviewer: optional, reviews each task's changes (read-only)",
        'One agent may hold several roles. What each agent can do when coding:',
        ...AGENT_IDS.map(id => `- ${AGENT_NAMES[id]} ${CAPABILITIES[id]}`),
        'You are read-only now: do not edit files or run commands that change anything.',
        'Keep your message under 200 words. When you agree with the current proposal, end your message with [READY].',
      ].join('\n');
    case 'roles':
      return 'Write the roles the discussion agreed on (or your best proposal) as one fenced json block and nothing else:\n```json\n{"orchestrator": "codex", "coders": ["claude"], "reviewer": "agy", "options": ["Make Claude the reviewer", "Let Antigravity code too"]}\n```\nUse the agent ids codex, claude, agy. reviewer may be null. options lists 2 to 4 short changes the owner might want instead (each under 160 characters). If the owner asked for changes in the conversation, apply them. Do not edit files.';
    case 'plan':
      return `You are the orchestrator. Break the owner's task into 1 to 20 small tasks that coders do one at a time, in order.\nThe coders are:\n${team}\nPlan around what each coder can run. Reply with one fenced json block:\n\`\`\`json\n{"tasks": [{"title": "short title", "assignee": "${coders[0] ?? 'claude'}", "description": "what to do and how to check it"}], "options": ["Merge tasks 1 and 2", "Add a test task"]}\n\`\`\`\noptions lists 2 to 4 short changes the owner might want instead (each under 160 characters). If the owner asked for changes in the conversation, apply them.\nDo not edit files.`;
    case 'build':
      return [
        `You are a coder. You ${CAPABILITIES[agent]}.`,
        `Do ONLY task ${extra.task.id}: ${extra.task.title}`,
        cap(extra.task.description, 2000),
        extra.task.notes ? `Your previous attempt was not accepted: ${cap(extra.task.notes, 4000)}\nFix that.` : '',
        'Work only inside the current folder. Do not run git commit; the room commits for you.',
        'When you are done, reply with a short summary of what you changed.',
      ].filter(Boolean).join('\n');
    case 'review':
      return `You are the reviewer. Review task ${extra.task.id}: ${extra.task.title}\n${cap(extra.task.description, 2000)}\n${extra.check ? `Checks passed: ${extra.check}\n` : ''}Do not edit files. Reply with one fenced json block:\n\`\`\`json\n{"verdict": "ok", "notes": ""}\n\`\`\`\nUse "changes" with clear notes if the task is not done correctly.\n\nDIFF:\n${cap(extra.diff, 8000)}`;
    case 'reassign':
      return `You are the orchestrator. Task ${extra.task.id} (${extra.task.title}) failed twice with ${AGENT_NAMES[extra.task.assignee]}. Last reason: ${cap(extra.reason, 2000)}\nThe coders are:\n${team}\nReply with one fenced json block, either {"action": "reassign", "to": "<coder id>"} with a different coder, or {"action": "skip"}.`;
    case 'finish':
      return 'You are the orchestrator. All tasks are finished or skipped. Write the project summary in Markdown: what was built, how to run it, and what was skipped. Do not edit files.\n'
        + 'Then add one fenced json block {"memory": ["..."]} with 0 to 5 short notes for future sessions in this project: decisions, gotchas or commands that work. '
        + 'Only include a note if it would change how an agent works here; the owner approves each one.';
    case 'opening':
      return [
        "This is a debate between three AI agents: Codex (codex), Claude (claude) and Antigravity (agy). Answer the owner's question on your own, without seeing the other agents' answers.",
        'You may read files in the current folder to ground your answer in the real code. You are read-only: Do not edit files or run commands that change anything.',
        'Give a clear position, your main reasons and the risks. Keep it under 400 words.',
      ].join('\n');
    case 'critique':
      return [
        'This is the critique round of a debate. The opening answers (and any earlier critiques) are in the conversation below.',
        'Critique the other two answers: what is wrong, missing or risky, and what is better than yours. Then state whether you keep or revise your own position, and why.',
        'You are read-only: Do not edit files or run commands that change anything. Keep it under 400 words.',
      ].join('\n');
    case 'verdict':
      return [
        'You are the judge of this debate. Read the whole conversation below and write the combined answer for the owner in Markdown, with exactly these sections:',
        '## Where they agree',
        '## Where they disagree',
        '## Recommendation',
        'Be fair to every agent, including yourself, and say who argued what. Reply with the Markdown only. Do not edit files.',
      ].join('\n');
    default:
      throw new Error(`Unknown stage ${stage}`);
  }
}

// Extra rules a session template adds to the plan and build prompts.
function templateRules(stage, extra) {
  if (extra.template === 'bugfix' && stage === 'plan') {
    return 'This is a bug fix. Task 1 must only add an automated test that reproduces the bug and fails now. The later tasks fix the bug so that test, and every other check, passes.';
  }
  if (extra.template === 'bugfix' && stage === 'build' && extra.task?.id === 1) {
    return 'Only add the failing test that reproduces the bug. Do not fix the bug in this task; the checks must fail after it.';
  }
  if (extra.template === 'refactor' && ['plan', 'build', 'review'].includes(stage)) {
    return 'This is a refactor. Behaviour must not change, and every existing check must stay green.';
  }
  return '';
}

export function buildPrompt({ stage, agent, roles, task, planText = '', transcript = [], extra = {}, memory = [] }) {
  const mine = rolesOf(agent, roles);
  const fixed = [
    `Room stage: ${stage}`,
    `You are ${AGENT_NAMES[agent]} (${agent}) in the Ascend Agent Room${mine.length ? `, roles: ${mine.join(', ')}` : ''}.`,
    '',
    stageRules(stage, agent, roles, extra),
    templateRules(stage, extra),
    memory.length ? `\nPROJECT MEMORY (owner-approved notes from earlier sessions):\n${cap(memory.map(n => `- ${n}`).join('\n'), 3000)}` : '',
    '',
    DEBATE_STAGES.has(stage) ? 'QUESTION:' : 'OWNER TASK:',
    cap(task, 4000),
    planText ? `\nPLAN.md:\n${cap(planText, 6000)}` : '',
  ].join('\n');
  const budget = Math.max(0, Math.min(12_000, MAX_PROMPT_CHARS - fixed.length - 40));
  const tail = transcriptTail(transcript, { maxChars: budget });
  return tail ? `${fixed}\n\nCONVERSATION SO FAR:\n${tail}` : fixed;
}
