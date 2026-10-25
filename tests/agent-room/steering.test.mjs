import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude', 'codex'], reviewer: null };
const soon = () => new Date(Date.now() + 3600_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

function session({ tasks = [{ title: 'One', assignee: 'claude', description: 'd' }], quota = {}, respond } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const reply = respond ?? (({ stage, prompt }) => {
    if (stage === 'plan') return { text: json({ tasks }) };
    if (stage === 'build') { const id = /Do ONLY task (\d+)/.exec(prompt)[1]; return { text: 'done', files: { [`task${id}.txt`]: `${id}\n` } }; }
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  });
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(reply, calls) }, { project: 'steer', task: 't', roles: ROLES });
  s.quotaOf = agent => quota[agent];
  return { s, calls, buildsRoot };
}

const approve = async s => { await s.kick(); await s.gate({ gate: 'plan', decision: 'approve' }); };

test('a task moves off a coder at 90% of a live window to the coder with the most room', async () => {
  const { s, calls } = session({ quota: { claude: { weekly: { usedPercent: 95, resetsAt: soon() } }, codex: { fiveHour: { usedPercent: 40, resetsAt: soon() } } } });
  await approve(s);
  assert.equal(calls.find(c => c.stage === 'build').agent, 'codex');
  assert.equal(s.state.plan.tasks[0].assignee, 'codex');
  assert.ok(s.transcript.some(m => m.text === 'Task 1 moved from Claude (95% of a usage window used) to Codex.'));
});

test('no move when the window has reset, when the other coder is full too, or below 90%', async () => {
  for (const quota of [
    { claude: { weekly: { usedPercent: 99, resetsAt: past() } } },
    { claude: { weekly: { usedPercent: 99, resetsAt: soon() } }, codex: { fiveHour: { usedPercent: 92, resetsAt: soon() } } },
    { claude: { weekly: { usedPercent: 89, resetsAt: soon() } } },
  ]) {
    const { s, calls } = session({ quota });
    await approve(s);
    assert.equal(calls.find(c => c.stage === 'build').agent, 'claude', JSON.stringify(quota));
  }
  const free = session({ quota: { claude: { weekly: { usedPercent: 91, resetsAt: soon() } } } });
  free.s.state.roles.coders = ['claude', 'agy'];
  await approve(free.s);
  assert.equal(free.calls.find(c => c.stage === 'build').agent, 'agy', 'an agent without readings counts as free');
});

test('owner notes are said in the chat and join every later prompt, the last five kept', async () => {
  const { s, calls } = session();
  await s.kick();
  assert.throws(() => s.note(''), /NOTE_INVALID/);
  for (let i = 1; i <= 6; i++) s.note(`note  ${i}`);
  assert.deepEqual(s.state.ownerNotes.map(n => n.text), ['note 2', 'note 3', 'note 4', 'note 5', 'note 6']);
  assert.ok(s.transcript.some(m => m.text === 'Owner note: note 6'));
  await s.gate({ gate: 'plan', decision: 'approve' });
  const build = calls.find(c => c.stage === 'build').prompt;
  assert.match(build, /OWNER NOTES, added while the session runs \(newest last\)\. Follow them:\n- note 2\n[^]*- note 6/);
  assert.ok(!build.includes('- note 1\n'));
  await s.gate({ gate: 'result', decision: 'accept' });
  assert.throws(() => s.note('late'), /SESSION_ENDED/);
});

test('rewinding to a task undoes its committed work and later tasks, then runs them again', async () => {
  const tasks = [{ title: 'One', assignee: 'claude', description: 'd' }, { title: 'Two', assignee: 'claude', description: 'd' }, { title: 'Three', assignee: 'codex', description: 'd' }];
  const { s, calls } = session({ tasks });
  await approve(s);
  assert.equal(s.state.stage, 'gate-result');
  const dir = s.state.projectDir;
  const firstCommit = s.state.plan.tasks[0].commit;
  const loop = s.rewind({ to: 'task', task: 2 });
  assert.equal(existsSync(join(dir, 'task1.txt')), true, 'task 1 stays');
  assert.equal(existsSync(join(dir, 'task2.txt')), false, 'task 2 is undone');
  assert.equal(existsSync(join(dir, 'task3.txt')), false, 'and so is task 3');
  await loop;
  const reran = calls.filter(c => c.stage === 'build').map(c => Number(/Do ONLY task (\d+)/.exec(c.prompt)[1]));
  assert.deepEqual(reran, [1, 2, 3, 2, 3]);
  assert.equal(s.state.stage, 'gate-result');
  assert.equal(s.state.plan.tasks[0].commit, firstCommit);
  assert.ok(s.transcript.some(m => m.text === 'Owner rewound the session to task 2 (and the 1 after it).'));
  assert.equal(existsSync(join(dir, 'task2.txt')), true);
});

test('rewinding to the plan asks for a new plan; rewinds wait for a gate or a pause and never touch debates', async () => {
  const { s, calls, buildsRoot } = session();
  await s.kick();
  await s.rewind({ to: 'plan' });
  assert.equal(calls.filter(c => c.stage === 'plan').length, 2);
  assert.equal(s.state.stage, 'gate-plan');
  assert.throws(() => s.rewind({ to: 'task', task: 9 }), /REWIND_INVALID/);
  assert.throws(() => s.rewind({ to: 'nowhere' }), /REWIND_INVALID/);
  await s.gate({ gate: 'plan', decision: 'approve' });
  await s.gate({ gate: 'result', decision: 'accept' });
  assert.throws(() => s.rewind({ to: 'plan' }), /REWIND_NOT_NOW/, 'a finished session stays finished');
  mkdirSync(join(buildsRoot, 'folder'));
  const debate = RoomSession.createDebate({ dataDir: join(s.dir, '..', '..'), settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })) }, { question: 'q?', folder: join(buildsRoot, 'folder') });
  assert.throws(() => debate.rewind({ to: 'plan' }), /REWIND_BUILD_ONLY/);
});
