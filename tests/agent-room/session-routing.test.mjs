import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const PLAN = { tasks: [{ title: 'API', assignee: 'claude', description: 'd' }] };
const agentMsgs = session => session.transcript.filter(m => m.from !== 'room');
const routes = session => agentMsgs(session).map(m => `${m.from}>${m.to.join(',') || 'owner'}`);

function setup(respond, settingsPatch = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  return { dataDir, opts: { dataDir, settings: { ...testSettings(buildsRoot), ...settingsPatch }, runTurn: fakeRunTurn(respond) } };
}

const buildRespond = ({ stage, agent, prompt }) => {
  if (stage === 'plan') return { text: json(PLAN) };
  if (stage === 'build') return { text: 'built', files: { [`${agent}-${prompt.length}.txt`]: 'x' } };
  if (stage === 'review') return { text: json({ verdict: 'ok' }) };
  if (stage === 'finish') return { text: 'summary' };
  if (stage === 'discuss') return { text: `${agent} [READY]` };
  if (stage === 'roles') return { text: json({ orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' }) };
  throw new Error(stage);
};

test('build with a reviewer: plan to owner, assign line, coder to reviewer, review to coder, summary to owner', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.deepEqual(routes(session), ['codex>owner', 'claude>agy', 'agy>claude', 'codex>owner']);
  const assign = session.transcript.find(m => m.kind === 'assign');
  assert.deepEqual({ from: assign.from, by: assign.by, to: assign.to, text: assign.text },
    { from: 'room', by: 'codex', to: ['claude'], text: 'Task 1: API → Claude' });
});

test('build without a reviewer: the coder reports to the orchestrator', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.deepEqual(routes(session), ['codex>owner', 'claude>codex', 'codex>owner']);
});

test('discussion goes to the other two; the roles proposal goes to the owner', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't' });
  await session.kick();
  assert.deepEqual(routes(session), ['codex>claude,agy', 'claude>codex,agy', 'agy>codex,claude', 'codex>owner']);
});

test('a reassign decision is addressed to the new coder; a skip to the owner', async () => {
  for (const [decision, expected] of [[{ action: 'reassign', to: 'agy' }, 'codex>agy'], [{ action: 'skip' }, 'codex>owner']]) {
    const { opts } = setup(({ stage }) => {
      if (stage === 'plan') return { text: json(PLAN) };
      if (stage === 'build') return { text: 'nothing changed' };
      if (stage === 'reassign') return { text: json(decision) };
      if (stage === 'finish') return { text: 'summary' };
      throw new Error(stage);
    });
    const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null } });
    await session.kick();
    await session.gate({ gate: 'plan', decision: 'approve' });
    const reassign = agentMsgs(session).find(m => m.text.includes('"action"'));
    assert.equal(`${reassign.from}>${reassign.to.join(',') || 'owner'}`, expected);
  }
});

test('debate: openings to the owner, critiques to the other two, the verdict to everyone', async () => {
  const { dataDir } = tempRoom();
  const folder = join(dataDir, '..', 'repo');
  mkdirSync(folder, { recursive: true });
  const { opts } = setup(({ agent, stage }) => ({ text: `${agent} ${stage}` }), { debateFolders: [folder], timeouts: { chat: 1000, build: 1000, debate: 1000 } });
  const session = RoomSession.create(opts, { mode: 'debate', question: 'q', folder, judge: 'claude' });
  await session.kick();
  assert.deepEqual(routes(session), [
    'codex>owner', 'claude>owner', 'agy>owner',
    'codex>claude,agy', 'claude>codex,agy', 'agy>codex,claude',
    'claude>codex,claude,agy',
  ]);
});

test('sub-agent lines name the agent and the sub-agent', async () => {
  const { opts } = setup(({ emit }) => {
    emit({ type: 'system', subtype: 'task_started', task_id: 't1', description: 'Look', subagent_type: 'Explore' });
    emit({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'completed' } });
    return { text: json(PLAN) };
  });
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'claude', coders: ['claude'], reviewer: null } });
  await session.kick();
  const lines = session.transcript.filter(m => m.kind === 'subagent');
  assert.equal(lines.length, 2);
  assert.ok(lines.every(m => m.from === 'room' && m.by === 'claude' && m.sub === 't1' && m.to.length === 0));
});

test('seq numbers every message and continues after a restore', async () => {
  const { opts } = setup(buildRespond);
  const session = RoomSession.create(opts, { project: 'p', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await session.kick();
  assert.deepEqual(session.transcript.map(m => m.seq), session.transcript.map((_, i) => i + 1));
  const restored = RoomSession.load({ settings: opts.settings, runTurn: opts.runTurn }, session.dir);
  restored.say('room', 'after restore');
  assert.equal(restored.transcript.at(-1).seq, session.transcript.length + 1);
});
