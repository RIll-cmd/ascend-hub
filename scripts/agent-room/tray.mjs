import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './store.mjs';
import { AGENT_COLORS, AGENT_NAMES, graphicFor, roomScene, tvStatus } from './tv-words.mjs';

// What the desktop launcher's tray remote shows: the three TVs in the room's own words, who leads, and today's sessions
// per agent. Pure apart from sessionsToday, which reads the history folder.
export const PROBE_TTL_MS = 10 * 60_000;
const IDS = ['codex', 'claude', 'agy'];
const SESSION_ID = /^\d+-[0-9a-f]{6}$/;
const TERMINAL = new Set(['done', 'rejected', 'stopped']);
const OUTCOMES = { done: 'DONE', rejected: 'REJECTED', stopped: 'STOPPED' };

function ageOf(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function rolesOf(id, roles) {
  if (!roles) return [];
  return [roles.orchestrator === id && 'orchestrator', roles.coders?.includes(id) && 'coder', roles.reviewer === id && 'reviewer'].filter(Boolean);
}

// Sessions started since local midnight, newest first, with the roles the tray needs to count them per agent.
export function sessionsToday(dataDir, nowMs) {
  const root = join(dataDir, 'sessions');
  if (!existsSync(root)) return [];
  const midnight = new Date(nowMs).setHours(0, 0, 0, 0);
  return readdirSync(root).filter(id => SESSION_ID.test(id)).sort().reverse()
    .map(id => readJson(join(root, id, 'state.json')))
    .filter(s => s && Date.parse(s.createdAt) >= midnight)
    .map(s => ({ id: s.id, mode: s.mode ?? 'build', stage: s.stage, title: String(s.task ?? '').split('\n')[0].slice(0, 80), createdAt: s.createdAt, roles: s.roles ?? null }));
}

// An agent takes part in a build when it holds a role, and in every debate.
export function todayFor(id, sessions, nowMs) {
  return sessions.filter(s => s.mode === 'debate' || rolesOf(id, s.roles).length)
    .map(s => ({ id: s.id, headline: `${OUTCOMES[s.stage] ?? 'RUNNING'} · ${ageOf(nowMs - Date.parse(s.createdAt))} ago`, sub: s.title }));
}

// A new session from one line of text: a feature build of a new project named after its first words.
export function defaultTask(text) {
  const project = String(text).toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9-]/g, '')).filter(Boolean).slice(0, 3).join('-').slice(0, 40);
  return { template: 'feature', project: project || 'task', task: text };
}

export function trayView({ agents, session, sessions, probedAt, lastViewerAt, nowMs, buildsRoot }) {
  const scene = roomScene(session, null);
  const debate = session?.mode === 'debate';
  const stale = probedAt > 0 && nowMs - probedAt > PROBE_TTL_MS;
  const tvs = IDS.map(id => {
    const availability = agents[id]?.state;
    const active = session && !TERMINAL.has(session.stage) && session.active?.agent === id ? session.active : null;
    const state = availability === 'offline' ? 'offline' : availability !== 'ready' ? 'checking' : active ? 'busy' : 'idle';
    const roles = debate ? (session?.judge === id ? ['judge'] : []) : rolesOf(id, session?.roles ?? null);
    const agent = { id, name: AGENT_NAMES[id], color: AGENT_COLORS[id], state, activity: active?.activity ?? null, since: active?.since ?? null, roles };
    const s = tvStatus(agent, scene, graphicFor(id, state, scene), nowMs);
    // Readiness only goes stale for an agent at rest: one at work has answered just now.
    const old = stale && (state === 'idle' || state === 'offline') && s.bug !== 'WAIT';
    return { id, channel: s.channel, color: AGENT_COLORS[id], bug: s.bug, mood: s.mood, headline: s.headline,
      sub: old ? `${s.sub} · checked ${ageOf(nowMs - probedAt)} ago` : s.sub, banner: s.banner, stale: old };
  });
  const lead = (tvs.find(t => t.bug === 'WAIT') ?? tvs.find(t => t.bug === 'LIVE'))?.id ?? null;
  return {
    tvs, lead, running: Boolean(session && !TERMINAL.has(session.stage)), needs: scene.gate?.line ?? null, lastViewerAt, buildsRoot,
    today: Object.fromEntries(IDS.map(id => [id, todayFor(id, sessions, nowMs)])),
  };
}
