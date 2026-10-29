// The agent scorecard: grades each agent from saved sessions by fixed rules, never by an agent's opinion.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_IDS } from './parse.mjs';
import { AGENT_NAMES } from './prompts.mjs';
import { readJson } from './store.mjs';

const SESSION_ID = /^\d+-[0-9a-f]{6}$/;
const DAY_MS = 86_400_000;
const REVISION = 'Owner asked for changes to the';
const ASSIGNED = /^Task (\S+):/;

// Lines that do not parse (a write cut short) are skipped, so one bad line never hides a session.
function transcriptOf(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

// Past sessions newest first, at most 500; a state.json that does not parse (read mid-save) is skipped.
export function readSessions(dataDir) {
  const root = join(dataDir, 'sessions');
  if (!existsSync(root)) return [];
  const ids = readdirSync(root).filter(id => SESSION_ID.test(id)).sort().reverse().slice(0, 500);
  return ids.flatMap(id => {
    try {
      const state = readJson(join(root, id, 'state.json'));
      return state ? [{ state, transcript: transcriptOf(join(root, id, 'transcript.jsonl')) }] : [];
    } catch {
      return [];
    }
  });
}

const emptyAgent = () => ({
  coder: { tasks: 0, firstTry: 0, checksGreen: 0, checksScored: 0, stalls: 0, reassignedAway: 0, failures: 0, done: 0 },
  reviewer: { tasks: 0, roundsAsked: 0, laterFailed: 0 },
  orchestrator: { sessions: 0, done: 0, rejected: 0, revisions: 0 },
  tokens: 0,
  tokensPerPass: null,
});

const isFirstTry = t => t.status === 'done' && (t.attempts ?? 0) === 0 && (t.rounds ?? 0) <= 1 && !t.reassigned;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Owner stops before any work started are the owner's choice, not an agent's result.
function counted(state) {
  const tasks = state.plan?.tasks ?? [];
  return !(state.stage === 'stopped' && tasks.every(t => t.status === 'pending'));
}

function firstAssignee(transcript, taskId) {
  const line = transcript.find(m => m.kind === 'assign' && ASSIGNED.exec(m.text ?? '')?.[1] === String(taskId));
  return line?.to?.[0] ?? null;
}

export function scorecard(sessions, { now = Date.now(), days = 7 } = {}) {
  const from = days === null ? null : now - days * DAY_MS;
  const agents = Object.fromEntries(AGENT_IDS.map(id => [id, emptyAgent()]));
  const agent = id => (agents[id] ??= emptyAgent());
  const byRole = {};
  const endings = [];
  let total = 0;

  for (const { state, transcript = [] } of sessions) {
    const at = Date.parse(state.createdAt ?? '');
    if (from !== null && !(at >= from && at <= now)) continue;
    if (!counted(state)) continue;
    total += 1;
    const tasks = state.plan?.tasks ?? [];
    const reviewerId = state.roles?.reviewer ?? state.roles?.orchestrator ?? null;

    for (const t of tasks) {
      if (!t.assignee) continue;
      const coder = agent(t.assignee).coder;
      const first = isFirstTry(t);
      coder.tasks += 1;
      if (first) coder.firstTry += 1;
      if (t.status === 'done') coder.done += 1;
      if (t.check) {
        coder.checksScored += 1;
        if (t.check.ok) coder.checksGreen += 1;
      }
      if ((t.keptGoing ?? 0) > 0 || (t.extraRounds ?? 0) > 0) coder.stalls += 1;
      coder.failures += t.failures?.length ?? 0;
      if (t.reassigned) {
        const original = firstAssignee(transcript, t.id);
        if (original && original !== t.assignee) agent(original).coder.reassignedAway += 1;
      }
      const role = t.role || 'general';
      const cell = ((byRole[role] ??= {})[t.assignee] ??= { tasks: 0, firstTry: 0 });
      cell.tasks += 1;
      if (first) cell.firstTry += 1;

      if (reviewerId && t.status === 'done') {
        const reviewer = agent(reviewerId).reviewer;
        reviewer.tasks += 1;
        reviewer.roundsAsked += Math.max(0, (t.rounds ?? 1) - 1);
        if (state.stage === 'rejected' || t.check?.ok === false) reviewer.laterFailed += 1;
      }
    }

    const lead = state.roles?.orchestrator;
    if (lead) {
      const orchestrator = agent(lead).orchestrator;
      orchestrator.sessions += 1;
      if (state.stage === 'done') orchestrator.done += 1;
      if (state.stage === 'rejected') orchestrator.rejected += 1;
      orchestrator.revisions += transcript.filter(m => m.from === 'room' && String(m.text ?? '').startsWith(REVISION)).length;
    }

    // A session's usage is per agent, not per role, so a lead's planning tokens would swamp its coding cost.
    for (const [id, use] of Object.entries(state.usage ?? {})) if (id !== lead) agent(id).tokens += Number(use?.tokens) || 0;

    if (state.stage === 'rejected' || state.stage === 'stopped') {
      const before = (state.stageLog ?? []).map(s => s.stage).filter(s => s !== state.stage);
      endings.push({
        id: state.id, at: state.createdAt ?? null, stage: state.stage,
        lastStage: before.at(-1) ?? null, task: String(state.task ?? state.question ?? '').slice(0, 120),
      });
    }
  }

  const weekly = [];
  for (const [id, a] of Object.entries(agents)) {
    a.tokensPerPass = a.tokens && a.coder.done ? Math.round(a.tokens / a.coder.done) : null;
    delete a.coder.done;
    const parts = [
      a.coder.tasks && plural(a.coder.tasks, 'task'),
      a.coder.firstTry && `${a.coder.firstTry} first try`,
      a.reviewer.roundsAsked && `${plural(a.reviewer.roundsAsked, 'review round')} asked`,
      a.orchestrator.sessions && `led ${plural(a.orchestrator.sessions, 'session')}`,
    ].filter(Boolean);
    if (parts.length) weekly.push(`${AGENT_NAMES[id] ?? id}: ${parts.join(', ')}`);
  }

  return {
    window: { days, from: from === null ? null : new Date(from).toISOString(), to: new Date(now).toISOString() },
    sessions: total, agents, byRole, endings, weekly,
  };
}
