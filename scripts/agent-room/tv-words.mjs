// The room's arrangement and its TVs' words, in plain ESM so the agent room (Node) and Hub's deck (TypeScript, through
// app/room/deck/room-scene.ts and tv-status.ts) read the same description. No Node-only imports: Hub bundles this.

export const AGENT_NAMES = { codex: 'Codex', claude: 'Claude', agy: 'Antigravity' };
export const AGENT_COLORS = { codex: '#e28a2b', claude: '#d97757', agy: '#3d7bff' };
// Continues the shelf's numbering (CH 03 Codex, CH 04 Antigravity); Claude has no shelf TV, so it takes the next one.
export const CHANNELS = { codex: 'CH 03', agy: 'CH 04', claude: 'CH 05' };

const TERMINAL = new Set(['done', 'rejected', 'stopped']);
const PANEL_STAGES = new Set(['discuss', 'roles', 'gate-roles']);
const PHASES = new Set(['opening', 'critique', 'verdict']);
const GATE_LINES = {
  'gate-roles': 'approve the roles', 'gate-plan': 'approve the plan', 'gate-race': 'pick a race winner', 'gate-result': 'review the result',
};
const PLAN_STATUS = { done: 'done', running: 'running', review: 'running', pending: 'pending', skipped: 'failed' };

function upNextOf(queue) {
  if (queue?.items.length) return queue.items[0].title;
  const next = [...(queue?.schedules ?? [])].sort((a, b) => a.nextRun.localeCompare(b.nextRun))[0];
  return next ? `${next.title} · ${new Date(next.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null;
}

// Who is reviewing right now: the agent in a turn on a task under review that is not its own coder (any review pass).
export function reviewerAtWork(session) {
  const current = session.plan?.tasks.find(t => t.status === 'review') ?? null;
  const agent = session.active?.agent ?? null;
  return current && agent && agent !== current.assignee ? agent : null;
}

export function roomScene(session, queue) {
  const base = {
    kind: 'idle', gate: null, roles: { orchestrator: null, coders: [], reviewer: null }, plan: [], task: null, check: null,
    phase: null, speaker: null, judge: null, queued: queue?.items.length ?? 0, upNext: upNextOf(queue), working: [], reviewing: null,
  };
  if (!session || TERMINAL.has(session.stage)) return base;
  const debate = session.mode === 'debate';
  const kind = debate || PANEL_STAGES.has(session.stage) ? 'debate' : 'coding';
  const roles = session.roles ? { orchestrator: session.roles.orchestrator, coders: [...session.roles.coders], reviewer: session.roles.reviewer } : base.roles;
  const pause = session.pause;
  // A rate-limit pause with a retry time resumes by itself, so it does not ask for the owner.
  const selfRetry = pause?.kind === 'rate-limit' && Boolean(pause.retryAt);
  const gate = pause && !selfRetry ? { line: 'paused · retry or stop' } : GATE_LINES[session.stage] && !debate ? { line: GATE_LINES[session.stage] } : null;
  const tasks = session.plan?.tasks ?? [];
  const current = tasks.find(t => t.status === 'running' || t.status === 'review') ?? null;
  const check = session.checking ? 'running' : current?.check ? (current.check.ok ? 'pass' : 'fail') : null;
  const reviewing = reviewerAtWork(session);
  const racing = session.active?.activity?.startsWith('racing') ?? false;
  const working = [...new Set([...tasks.filter(t => t.status === 'running').map(t => t.assignee), ...(racing ? roles.coders : [])])];
  let strip = null;
  if (current) {
    const index = tasks.indexOf(current) + 1;
    const coder = `${AGENT_NAMES[current.assignee]} ${current.status === 'review' ? 'done' : 'coding'}`;
    const reviewer = roles.reviewer ? ` · ${AGENT_NAMES[roles.reviewer]} ${reviewing === roles.reviewer ? 'reviewing' : 'assigned'}` : '';
    strip = `Task ${index}/${tasks.length} · ${coder}${reviewer}`;
  }
  return {
    ...base, kind, gate, roles, check, task: strip, working, reviewing,
    plan: tasks.map(t => ({ title: t.title, status: PLAN_STATUS[t.status], assignee: t.assignee })),
    phase: debate && PHASES.has(session.stage) ? session.stage : null,
    speaker: kind === 'debate' ? session.active?.agent ?? null : null,
    judge: debate ? session.judge ?? null : null,
  };
}

// What an agent's TV shows instead of its eye, from what it is doing right now. An offline agent always shows NO SIGNAL.
export function graphicFor(id, state, scene) {
  if (state === 'offline') return null;
  if (scene.kind === 'debate') return state === 'busy' && scene.speaker === id ? 'wave' : null;
  if (scene.kind !== 'coding') return null;
  if (scene.reviewing === id) return 'review';
  if (scene.working.includes(id)) return 'code';
  return scene.roles.orchestrator === id ? 'plan' : null;
}

const VERBS = { code: 'CODING', review: 'REVIEWING', plan: 'PLANNING', wave: 'SPEAKING' };
const GREY = '#5f5e5a';
const AMBER = '#ba7517';

function age(since, nowMs) {
  const start = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(start)) return null;
  const minutes = Math.floor((nowMs - start) / 60_000);
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function taskLine(scene, pick) {
  const index = scene.plan.findIndex(t => t.status === 'running' && pick(t));
  return index < 0 ? null : `task ${index + 1}/${scene.plan.length} · ${scene.plan[index].title}`;
}

// The shelf's status style on the room's TVs: a channel bug, a mascot whose face shows the mood, and a news lower
// third (headline banner over a line of detail).
export function tvStatus(agent, scene, graphic, nowMs) {
  const name = agent.name.toUpperCase();
  const channel = CHANNELS[agent.id];
  if (agent.state === 'offline') return { channel, bug: 'OFF', mood: 'offline', headline: `${name} · OFFLINE`, sub: 'CLI not available', banner: GREY };
  // A gate is the orchestrator's to raise; before roles exist every TV asks.
  const holder = scene.roles.orchestrator ?? scene.roles.coders[0] ?? null;
  if (scene.gate && (holder === null || holder === agent.id)) {
    return { channel, bug: 'WAIT', mood: 'stuck', headline: `${name} · NEEDS YOU`, sub: scene.gate.line, banner: AMBER };
  }
  if (agent.state === 'checking') return { channel, bug: 'IDLE', mood: 'idle', headline: `${name} · CHECKING`, sub: 'looking for its CLI', banner: GREY };
  if (agent.state === 'idle') {
    return { channel, bug: 'IDLE', mood: 'idle', headline: `${name} · IDLE`, sub: agent.roles.join(' · ') || 'ready', banner: GREY };
  }
  const what = graphic === 'code' ? taskLine(scene, t => t.assignee === agent.id)
    : graphic === 'review' ? taskLine(scene, t => t.assignee !== agent.id)
      : graphic === 'wave' ? scene.phase : null;
  const sub = [what ?? agent.activity ?? 'working', age(agent.since, nowMs)].filter(Boolean).join(' · ');
  return { channel, bug: 'LIVE', mood: graphic === 'review' ? 'reviewing' : 'working', headline: `${name} · ${graphic ? VERBS[graphic] : 'WORKING'}`, sub, banner: agent.color };
}
