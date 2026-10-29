// The agent scorecard: grades each agent from saved sessions by fixed rules, never by an agent's opinion.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_IDS } from './parse.mjs';
import { AGENT_NAMES } from './prompts.mjs';
import { phonePush } from './notify.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

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

const isFirstTry = (t, moved) => t.status === 'done' && (t.attempts ?? 0) === 0 && (t.rounds ?? 0) <= 1 && !moved;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Owner stops before any work started are the owner's choice, not an agent's result.
// stop() puts cut-off tasks back to pending, so started work shows in rounds, attempts, failures or an assign line.
function counted(state, transcript) {
  if (state.stage !== 'stopped') return true;
  const started = t => t.status !== 'pending' || (t.rounds ?? 0) > 0 || (t.attempts ?? 0) > 0 || (t.failures?.length ?? 0) > 0;
  return (state.plan?.tasks ?? []).some(started) || transcript.some(m => m.kind === 'assign');
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
    if (!counted(state, transcript)) continue;
    total += 1;
    const tasks = state.plan?.tasks ?? [];
    const reviewerId = state.roles?.reviewer ?? state.roles?.orchestrator ?? null;

    for (const t of tasks) {
      if (!t.assignee) continue;
      const coder = agent(t.assignee).coder;
      // An owner reassignment never sets `reassigned`, so the first assign line decides; a race is assigned to every coder at once.
      const original = t.race || t.raced ? null : firstAssignee(transcript, t.id);
      const moved = Boolean(t.reassigned) || (original !== null && original !== t.assignee);
      const first = isFirstTry(t, moved);
      coder.tasks += 1;
      if (first) coder.firstTry += 1;
      if (t.status === 'done') coder.done += 1;
      if (t.check) {
        coder.checksScored += 1;
        if (t.check.ok) coder.checksGreen += 1;
      }
      if ((t.keptGoing ?? 0) > 0 || (t.extraRounds ?? 0) > 0) coder.stalls += 1;
      coder.failures += t.failures?.length ?? 0;
      if (original && original !== t.assignee) agent(original).coder.reassignedAway += 1;
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

// ISO 8601 week of a local date, such as 2026-W45: the week belongs to the year of its Thursday.
function isoWeek(date) {
  const weekday = (date.getDay() + 6) % 7;
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday - firstThursday) / DAY_MS - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const weeklyFile = (dataDir, key) => join(dataDir, 'scorecard', `${key}.json`);

// From Monday 09:00 local until the week's summary is saved; a room that was off on Monday catches up later that week.
export function weeklyDue(dataDir, now = new Date()) {
  const weekday = (now.getDay() + 6) % 7;
  const mondayNine = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday, 9);
  const key = isoWeek(now);
  return now >= mondayNine && !existsSync(weeklyFile(dataDir, key)) ? key : null;
}

export function markWeekly(dataDir, key, lines) {
  writeJsonAtomic(weeklyFile(dataDir, key), { key, at: new Date().toISOString(), lines });
}

// One push a week with last week's lines; nothing without notify.ntfy. Returns whether it sent.
export function sendWeekly(dataDir, settings, fetchImpl = globalThis.fetch, now = new Date()) {
  const key = weeklyDue(dataDir, now);
  if (!key || !settings.notify?.ntfy) return false;
  const { weekly } = scorecard(readSessions(dataDir), { now: now.getTime(), days: 7 });
  const lines = weekly.length ? weekly : ['No agent work this week.'];
  phonePush(settings.notify, ['Agent scorecard, last 7 days:', ...lines].join('\n'), fetchImpl);
  markWeekly(dataDir, key, lines);
  return true;
}
