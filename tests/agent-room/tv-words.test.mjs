import assert from 'node:assert/strict';
import test from 'node:test';
import { graphicFor, roomScene, tvStatus } from '../../scripts/agent-room/tv-words.mjs';

const task = (id, patch = {}) => ({ id, title: `Task ${id}`, assignee: 'claude', description: 'd', status: 'pending', attempts: 0, commit: null, notes: '', ...patch });
const session = () => ({
  id: 's1', mode: 'build', project: 'p', projectDir: 'D:\\b\\p', task: 't', stage: 'build',
  roles: { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' },
  plan: { tasks: [task(1, { status: 'done' }), task(2, { status: 'running', title: 'Login form' }), task(3)] },
  pause: null, active: { agent: 'claude', activity: 'editing', since: '2026-10-27T10:00:00Z', subagents: [] }, transcript: [],
});

test('the room can read the TV words without TypeScript', () => {
  const scene = roomScene(session(), null);
  const s = tvStatus({ id: 'claude', name: 'Claude', color: '#d97757', state: 'busy', activity: 'editing', since: '2026-10-27T10:00:00Z', roles: ['coder'] }, scene, graphicFor('claude', 'busy', scene), Date.parse('2026-10-27T10:04:30Z'));
  assert.deepEqual([s.channel, s.bug, s.headline, s.sub], ['CH 05', 'LIVE', 'CLAUDE · CODING', 'task 2/3 · Login form · 4m']);
});
