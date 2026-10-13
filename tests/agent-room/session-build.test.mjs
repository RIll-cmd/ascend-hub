import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const log = dir => spawnSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n').reverse();
const PLAN = { tasks: [{ title: 'One', assignee: 'claude', description: 'a' }, { title: 'Two', assignee: 'agy', description: 'b' }] };

async function toBuild(respond, roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: 'agy' }) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) };
  const session = RoomSession.create(opts, { project: 'app', task: 't', roles });
  await session.kick();
  assert.equal(session.state.stage, 'gate-plan');
  return { session, calls, opts, dir: join(buildsRoot, 'app') };
}

test('full happy path: tasks commit in order, reviewer approves, summary, owner accepts', async () => {
  const { session, calls, dir } = await toBuild(({ stage, agent, prompt }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') return { text: 'done', files: { [`${agent}-${/task (\d+)/.exec(prompt)[1]}.txt`]: 'x' } };
    if (stage === 'review') return { text: json({ verdict: 'ok' }) };
    if (stage === 'finish') return { text: '# Summary\nAll good.' };
    throw new Error(stage);
  });
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(session.state.stage, 'gate-result');
  assert.deepEqual(log(dir), ['chore: start project', 'plan: initial plan', 'task-1: One', 'task-2: Two', 'docs: summary']);
  assert.deepEqual(session.state.plan.tasks.map(t => t.status), ['done', 'done']);
  assert.ok(session.state.plan.tasks.every(t => /^[0-9a-f]{7,}$/.test(t.commit)));
  assert.deepEqual(calls.filter(c => c.stage === 'build').map(c => `${c.agent}:${c.mode}`), ['claude:edit', 'agy:edit']);
  assert.ok(calls.filter(c => c.stage === 'review').every(c => c.agent === 'agy' && c.mode === 'read'));
  assert.match(calls.find(c => c.stage === 'review').prompt, /\+x/);
  assert.equal(readFileSync(join(dir, 'SUMMARY.md'), 'utf8'), '# Summary\nAll good.\n');
  await session.gate({ gate: 'result', decision: 'accept' });
  assert.equal(session.state.stage, 'done');
});

test('changes requested: one retry with notes, then orchestrator reassigns, then success', async () => {
  let claudeTries = 0;
  const { session, calls } = await toBuild(({ stage, agent }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') { if (agent === 'claude') claudeTries++; return { text: 'did it', files: { [`f${claudeTries}-${agent}.txt`]: 'x' } }; }
    if (stage === 'review') return { text: json(agent === 'agy' && calls.filter(c => c.stage === 'build').at(-1).agent === 'claude' ? { verdict: 'changes', notes: 'needs tests' } : { verdict: 'ok' }) };
    if (stage === 'reassign') return { text: json({ action: 'reassign', to: 'agy' }) };
    if (stage === 'finish') return { text: 'ok' };
    throw new Error(stage);
  });
  await session.gate({ gate: 'plan', decision: 'approve' });
  const builds = calls.filter(c => c.stage === 'build');
  assert.deepEqual(builds.map(c => c.agent), ['claude', 'claude', 'agy']);
  assert.match(builds[1].prompt, /not accepted: needs tests/);
  assert.equal(session.state.plan.tasks[0].assignee, 'agy');
  assert.equal(session.state.plan.tasks[0].status, 'done');
});

test('no changes twice with a reassigned task means skip without asking again', async () => {
  const { session, calls } = await toBuild(({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') return { text: 'I did nothing' };
    if (stage === 'reassign') return { text: json({ action: 'reassign', to: 'agy' }) };
    if (stage === 'finish') return { text: 'summary' };
    throw new Error(stage);
  }, { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null });
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(calls.filter(c => c.stage === 'reassign').length, 1);
  assert.equal(calls.filter(c => c.stage === 'build').length, 4);
  assert.equal(session.state.plan.tasks[0].status, 'skipped');
  assert.equal(session.state.stage, 'gate-result');
});

test('stop mid-edit kills the turn, rolls back uncommitted files, and runs nothing more', async () => {
  let release;
  const started = new Promise(resolve => { release = resolve; });
  const { session, calls, dir } = await toBuild(({ stage, cwd, signal }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') {
      return new Promise(resolve => {
        writeFileSync(join(cwd, 'half.txt'), 'partial');
        signal.addEventListener('abort', () => resolve({ aborted: true }));
        release();
      });
    }
    throw new Error(stage);
  });
  const loop = session.gate({ gate: 'plan', decision: 'approve' });
  await started;
  await session.stop();
  await loop;
  assert.equal(session.state.stage, 'stopped');
  assert.equal(existsSync(join(dir, 'half.txt')), false);
  assert.equal(calls.filter(c => c.stage === 'build').length, 1);
  assert.equal(session.state.active, null);
});

test('restart mid-build: reload rolls back the running task and re-runs it', async () => {
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') return { text: 'done', files: { 'good.txt': 'ok' } };
    if (stage === 'finish') return { text: 'summary' };
    throw new Error(stage);
  };
  const { session, opts, dir } = await toBuild(respond, { orchestrator: 'codex', coders: ['claude'], reviewer: null });
  // Simulate a crash during task 1: stage build, task running, stray file on disk.
  session.state.stage = 'build';
  session.state.plan.tasks[0].status = 'running';
  session.state.active = { agent: 'claude', activity: 'editing', since: 'x' };
  session.save();
  writeFileSync(join(dir, 'stray.txt'), 'from the crashed turn');
  const restored = RoomSession.load({ settings: opts.settings, runTurn: fakeRunTurn(respond) }, session.dir);
  assert.equal(restored.state.active, null);
  await restored.kick();
  assert.equal(existsSync(join(dir, 'stray.txt')), false);
  assert.equal(existsSync(join(dir, 'good.txt')), true);
  assert.equal(restored.state.stage, 'gate-result');
  assert.ok(restored.transcript.length > 3, 'transcript reloaded');
});

test('owner reassign while paused in build changes the assignee and resumes', async () => {
  let claudeFails = true;
  const { session, calls } = await toBuild(({ stage, agent }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') return agent === 'claude' && claudeFails ? { ok: false } : { text: 'done', files: { 'x.txt': 'x' } };
    if (stage === 'finish') return { text: 'summary' };
    throw new Error(stage);
  }, { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null });
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.match(session.state.pause.reason, /Claude failed twice/);
  assert.throws(() => session.resume({ action: 'reassign', agent: 'codex' }), { code: 'REASSIGN_INVALID' });
  claudeFails = false;
  await session.resume({ action: 'reassign', agent: 'agy' });
  assert.equal(calls.filter(c => c.stage === 'build').at(-1).agent, 'agy');
  assert.equal(session.state.stage, 'gate-result');
});
