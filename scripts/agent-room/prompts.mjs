import { AGENT_IDS } from './parse.mjs';
import { skillIndex } from './skills.mjs';

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

// The role sets the owner turned on, one line each, with the agents wearing them.
// Always-on sets are habits for everyone, not roles, so they are never offered here.
function setLines(roleSets, roles) {
  return roleSets.filter(s => !s.always).map(s => {
    const worn = AGENT_IDS.filter(id => roles?.wear?.[id]?.includes(s.id)).map(id => AGENT_NAMES[id]);
    return `- ${s.id} (${s.name}): ${s.prompt}${worn.length ? ` Worn by: ${worn.join(', ')}.` : ''}`;
  }).join('\n');
}

// A role set's prompt, its skills, and a reminder that the room's rules come first.
function roleRules(setId, roleSets) {
  const set = setId && roleSets.find(s => s.id === setId);
  if (!set) return '';
  const head = `ROLE: ${set.name}. ${set.prompt}`;
  if (!set.skills.length) return head;
  return `${head}\nSKILLS for this role. Before you start, read the SKILL.md of each one that applies to this task:\n${skillIndex(set)}\n${ROOM_WINS}`;
}

const ROOM_WINS = "The skills are guidance; where one conflicts with the room's rules below, the room's rules win.";

// The always-on sets' skills, for every coder task whatever its role.
function generalRules(roleSets, role) {
  const indexes = roleSets.filter(s => s.always && s.id !== role && s.skills.length).map(s => skillIndex(s));
  return indexes.length ? `GENERAL SKILLS for every task. Read the SKILL.md of each one that applies before you start:\n${indexes.join('\n')}` : '';
}

// The code review always runs with a reviewer; security and design reviews come with their role sets.
const REVIEW_PASSES = {
  code: { head: t => `You are the reviewer. Review task ${t.id}: ${t.title}`, fail: 'the task is not done correctly' },
  security: {
    head: t => `You are the security reviewer. Review task ${t.id}: ${t.title}, for security flaws only: injection, unsafe input handling, leaked secrets, missing auth or access checks, unsafe dependencies.`,
    fail: 'you find a security flaw',
  },
  design: {
    head: t => `You are the design reviewer. Review the interface changes of task ${t.id}: ${t.title}, for layout, hierarchy, accessibility and visual polish.`,
    fail: 'the interface needs changes',
  },
};

function stageRules(stage, agent, roles, extra, roleSets = []) {
  const coders = roles?.coders ?? [];
  const sets = setLines(roleSets, roles);
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
        sets ? `The owner turned on these role sets, specialist roles an agent can wear:\n${sets}\nAlso agree which agent wears which set.` : '',
        'Keep your message under 200 words. When you agree with the current proposal, end your message with [READY].',
      ].filter(Boolean).join('\n');
    case 'roles':
      return 'Write the roles the discussion agreed on (or your best proposal) as one fenced json block and nothing else:\n```json\n{"orchestrator": "codex", "coders": ["claude"], "reviewer": "agy", "options": ["Make Claude the reviewer", "Let Antigravity code too"]}\n```\nUse the agent ids codex, claude, agy. reviewer may be null. options lists 2 to 4 short changes the owner might want instead (each under 160 characters). If the owner asked for changes in the conversation, apply them. Do not edit files.'
        + (sets ? `\nAlso add "wear", saying which agent wears which role set, for example "wear": {"claude": ["${roleSets[0].id}"]}. The role sets are:\n${sets}` : '');
    case 'plan':
      return `You are the orchestrator. Break the owner's task into 1 to 20 small tasks that coders do one at a time, in order.\nThe coders are:\n${team}\nPlan around what each coder can run. Reply with one fenced json block:\n\`\`\`json\n{"tasks": [{"title": "short title", "assignee": "${coders[0] ?? 'claude'}", "description": "what to do and how to check it"}], "options": ["Merge tasks 1 and 2", "Add a test task"]}\n\`\`\`\noptions lists 2 to 4 short changes the owner might want instead (each under 160 characters). If the owner asked for changes in the conversation, apply them.\n${coders.length > 1 ? 'For at most one hard task where approaches may differ, add "race": true: every coder then attempts it in parallel and the best attempt is kept. Races cost one attempt per coder, so use them sparingly.\n' : ''}${sets ? `Role sets:\n${sets}\nGive each task that fits a set a "role" with that set's id, and assign it to an agent who wears that set when there is one. Leave "role" out for other tasks.\n` : ''}Do not edit files.`;
    case 'build':
      return [
        `You are a coder. You ${CAPABILITIES[agent]}.`,
        `Do ONLY task ${extra.task.id}: ${extra.task.title}`,
        cap(extra.task.description, 2000),
        extra.task.notes ? `Your previous attempt was not accepted: ${cap(extra.task.notes, 4000)}\nFix that.` : '',
        roleRules(extra.task.role, roleSets),
        generalRules(roleSets, extra.task.role),
        generalRules(roleSets, extra.task.role) && !roleRules(extra.task.role, roleSets).includes(ROOM_WINS) ? ROOM_WINS : '',
        'Work only inside the current folder. Do not run git commit; the room commits for you.',
        'When you are done, reply with a short summary of what you changed.',
      ].filter(Boolean).join('\n');
    case 'review': {
      const pass = REVIEW_PASSES[extra.pass?.kind ?? 'code'];
      const skills = roleRules(extra.pass?.set, roleSets);
      const shot = extra.screenshot?.file
        ? `A screenshot of the app after this task (1280x800) is at ${extra.screenshot.file}. Open it and judge what is visible as well as the diff.\n`
        : extra.screenshot?.error ? `The app preview could not be captured (${cap(extra.screenshot.error, 300)}), so judge from the diff.\n` : '';
      return `${pass.head(extra.task)}\n${cap(extra.task.description, 2000)}\n${skills ? `${skills}\n` : ''}${shot}${extra.check ? `Checks passed: ${extra.check}\n` : ''}Do not edit files. Reply with one fenced json block:\n\`\`\`json\n{"verdict": "ok", "notes": ""}\n\`\`\`\nUse "changes" with clear notes if ${pass.fail}.\n\nDIFF:\n${cap(extra.diff, 8000)}`;
    }
    case 'judge':
      return [
        `You judge a race. Every coder attempted task ${extra.task.id} (${extra.task.title}) on its own, and every attempt below passed the checks.`,
        cap(extra.task.description, 2000),
        'Pick the attempt to keep: correct first, then simplest and easiest to maintain. Do not edit files. Reply with one fenced json block:',
        `\`\`\`json\n{"winner": "${extra.attempts[0].agent}", "reason": "one sentence"}\n\`\`\``,
        ...extra.attempts.map(a => `\nATTEMPT BY ${AGENT_NAMES[a.agent].toUpperCase()} (${a.agent}): ${cap(a.summary, 500)}\nDIFF:\n${cap(a.diff, Math.floor(12_000 / extra.attempts.length))}`),
      ].join('\n');
    case 'progress':
      return [
        `You are the orchestrator. Task ${extra.task.id} (${extra.task.title}) has failed ${extra.task.attempts} time${extra.task.attempts === 1 ? '' : 's'}; ${AGENT_NAMES[extra.task.assignee]} is its coder.`,
        "Keep-going mode is on: the owner wants this task finished without waiting for them, while the session's budget lasts.",
        'Decide whether one more round is likely to succeed. Failures that get smaller or change mean progress; the same failure again and again means stuck.',
        'The latest failures, oldest first:',
        ...(extra.task.failures ?? []).map((f, i) => `${i + 1}. ${cap(f, 1500)}`),
        'Do not edit files. Reply with one fenced json block:',
        '```json\n{"verdict": "continue", "note": "one sentence telling the coder what to try next"}\n```',
        'Use "stuck" when another round would repeat the same failure.',
      ].join('\n');
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

export function buildPrompt({ stage, agent, roles, task, planText = '', transcript = [], extra = {}, memory = [], roleSets = [] }) {
  const mine = rolesOf(agent, roles);
  const fixed = [
    `Room stage: ${stage}`,
    `You are ${AGENT_NAMES[agent]} (${agent}) in the Ascend Agent Room${mine.length ? `, roles: ${mine.join(', ')}` : ''}.`,
    '',
    stageRules(stage, agent, roles, extra, roleSets),
    templateRules(stage, extra),
    extra.parallel && stage === 'plan' ? 'Tasks run at the same time unless ordered: give a task "after": [numbers of earlier tasks it needs first]. Tasks that change the same files must be ordered, or their merges conflict.' : '',
    memory.length ? `\nPROJECT MEMORY (owner-approved notes from earlier sessions):\n${cap(memory.map(n => `- ${n}`).join('\n'), 3000)}` : '',
    '',
    DEBATE_STAGES.has(stage) ? 'QUESTION:' : 'OWNER TASK:',
    cap(task, 4000),
    planText ? `\nPLAN.md:\n${cap(planText, 6000)}` : '',
    extra.diff && (stage === 'opening' || stage === 'critique') ? `\nPULL REQUEST DIFF:\n${cap(extra.diff, 12_000)}` : '',
  ].join('\n');
  const budget = Math.max(0, Math.min(12_000, MAX_PROMPT_CHARS - fixed.length - 40));
  const tail = transcriptTail(transcript, { maxChars: budget });
  return tail ? `${fixed}\n\nCONVERSATION SO FAR:\n${tail}` : fixed;
}
