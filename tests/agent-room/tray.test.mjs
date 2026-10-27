import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultTask, sessionsToday, todayFor, trayView } from '../../scripts/agent-room/tray.mjs';

const ready = { codex: { state: 'ready' }, claude: { state: 'ready' }, agy: { state: 'ready' } };
const task = (id, patch = {}) => ({ id, title: `Task ${id}`, assignee: 'claude', description: 'd', status: 'pending', attempts: 0, commit: null, notes: '', ...patch });
const session = (patch = {}) => ({
  id: 's1', mode: 'build', project: 'p', task: 't', stage: 'build',
  roles: { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' },
  plan: { tasks: [task(1, { status: 'done' }), task(2, { status: 'running', title: 'Login form' }), task(3)] },
  pause: null, active: { agent: 'claude', activity: 'editing', since: '2026-10-27T10:00:00Z', subagents: [] }, transcript: [],
  ...patch,
});
const NOW = Date.parse('2026-10-27T10:04:30Z');
const view = patch => trayView({ agents: ready, session: null, sessions: [], probedAt: NOW, lastViewerAt: null, nowMs: NOW, buildsRoot: 'D:\\builds', ...patch });

test('the lead is the TV that needs you, then one at work', () => {
  const gate = view({ session: session({ stage: 'gate-plan', active: null }) });
  assert.deepEqual([gate.lead, gate.needs, gate.running], ['codex', 'approve the plan', true]);
  const coding = view({ session: session() });
  assert.equal(coding.lead, 'claude');
  assert.deepEqual(coding.tvs.map(t => t.id), ['codex', 'claude', 'agy']);
  assert.deepEqual(coding.tvs[1], { id: 'claude', channel: 'CH 05', color: '#d97757', bug: 'LIVE', mood: 'working', headline: 'CLAUDE · CODING', sub: 'task 2/3 · Login form · 4m', banner: '#d97757', stale: false });
  const quiet = view({});
  assert.deepEqual([quiet.lead, quiet.needs, quiet.running, quiet.buildsRoot], [null, null, false, 'D:\\builds']);
});

test('a stale probe says when it checked', () => {
  const stale = view({ probedAt: NOW - 12 * 60_000 });
  assert.equal(stale.tvs[0].stale, true);
  assert.equal(stale.tvs[0].sub, 'ready · checked 12m ago');
  // Never probed yet: the agents are still being looked for, so there is no age to show.
  const never = view({ agents: { codex: { state: 'checking' }, claude: { state: 'checking' }, agy: { state: 'checking' } }, probedAt: 0 });
  assert.equal(never.tvs[0].sub, 'looking for its CLI');
});

test('today stops at local midnight', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'tray-'));
  const now = new Date(2026, 9, 27, 10, 0).getTime();
  const write = (id, at) => {
    mkdirSync(join(dataDir, 'sessions', id), { recursive: true });
    writeFileSync(join(dataDir, 'sessions', id, 'state.json'), JSON.stringify({ id, mode: 'build', stage: 'done', task: `Task ${id}\nmore`, roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, createdAt: new Date(at).toISOString() }));
  };
  write('1000-aaaaaa', new Date(2026, 9, 26, 23, 59).getTime());
  write('2000-bbbbbb', new Date(2026, 9, 27, 0, 1).getTime());
  assert.deepEqual(sessionsToday(dataDir, now).map(s => [s.id, s.title]), [['2000-bbbbbb', 'Task 2000-bbbbbb']]);
});

test('an agent counts the sessions it took part in', () => {
  const build = { id: 'b', mode: 'build', stage: 'done', title: 'Login form', createdAt: new Date(NOW - 37 * 60_000).toISOString(), roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } };
  const debate = { id: 'd', mode: 'debate', stage: 'stopped', title: 'Tabs or spaces', createdAt: new Date(NOW - 90 * 60_000).toISOString(), roles: null };
  assert.deepEqual(todayFor('agy', [build], NOW), []);
  assert.deepEqual(todayFor('codex', [build], NOW), [{ id: 'b', headline: 'DONE · 37m ago', sub: 'Login form' }]);
  assert.deepEqual(todayFor('agy', [build, debate], NOW), [{ id: 'd', headline: 'STOPPED · 1h 30m ago', sub: 'Tabs or spaces' }]);
  assert.deepEqual(view({ sessions: [build, debate] }).today.claude.map(e => e.id), ['b', 'd']);
});

test('defaultTask names the project from the first words', () => {
  assert.deepEqual(defaultTask('Build a todo app with tags'), { template: 'feature', project: 'build-a-todo', task: 'Build a todo app with tags' });
  assert.equal(defaultTask('!!!').project, 'task');
});
