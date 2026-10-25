import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AGY_COMMAND_CHARS, buildPrompt, escapedLength } from '../../scripts/agent-room/prompts.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { ensureRoomToken } from '../../scripts/agent-room/token.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

// The minor findings deferred by the Agent Room's first review (2026-10-13), each fixed here.
const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const TWO = { orchestrator: 'codex', coders: ['claude', 'codex'], reviewer: 'agy' };

test('a pause during the reassignment decision resumes that decision, not another build round', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  let answerReassign = false;
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'T', assignee: 'claude', description: 'd' }] }) };
    if (stage === 'build') return { text: 'tried', files: { [`f${calls.length}.txt`]: 'x' } };
    if (stage === 'review') return { text: json({ verdict: 'changes', notes: 'no' }) };
    if (stage === 'reassign') return { text: answerReassign ? json({ action: 'reassign', to: 'codex' }) : 'not json' };
    throw new Error(stage);
  };
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) }, { project: 'm1', task: 't', roles: TWO, limits: { rounds: 5 } });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.match(s.state.pause.reason, /returned invalid JSON twice/);
  const task = s.state.plan.tasks[0];
  assert.ok(task.pendingReassign);
  assert.equal(task.status, 'pending');
  const builds = calls.filter(c => c.stage === 'build').length;
  answerReassign = true;
  calls.length = 0;
  await s.resume({ action: 'retry' });
  assert.equal(calls[0].stage, 'reassign', 'Retry asks the reassignment question again');
  assert.equal(task.assignee, 'codex');
  assert.equal(task.pendingReassign, undefined);
  assert.equal(builds, 2);
  await s.stop();
});

test('a quoted ASCEND_ROOM_TOKEN in .env.local is read without its quotes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ascend-token-'));
  for (const [line, expected] of [['ASCEND_ROOM_TOKEN="abc123"', 'abc123'], ["ASCEND_ROOM_TOKEN='abc123'", 'abc123'], ['ASCEND_ROOM_TOKEN=abc123', 'abc123']]) {
    writeFileSync(join(dir, '.env.local'), `OTHER=1\n${line}\n`);
    assert.equal(ensureRoomToken(join(dir, '.env.local')), expected, line);
  }
});

test('the sign-in check runs from the builds folder, and status names that folder', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const { probeAgent, startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const seen = [];
  await probeAgent('claude', testSettings(buildsRoot), async (invocation, { cwd }) => { seen.push(cwd); return { ok: true, text: 'READY' }; });
  assert.deepEqual(seen, [buildsRoot]);
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })), probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const status = await (await fetch(`http://127.0.0.1:${room.port}/status`, { headers: { authorization: `Bearer ${room.token}` } })).json();
    assert.equal(status.buildsRoot, buildsRoot);
  } finally {
    await room.close();
  }
});

test('an Antigravity prompt full of quotes is shortened until it fits the Windows command line', () => {
  // Every character of these messages and the task doubles when Windows escapes it.
  const transcript = Array.from({ length: 40 }, (_, i) => ({ at: '', seq: i, from: 'claude', text: '"\\'.repeat(400) }));
  const args = { stage: 'discuss', roles: null, task: '"'.repeat(4000), planText: '\\'.repeat(6000), transcript };
  const claude = buildPrompt({ ...args, agent: 'claude' });
  assert.ok(escapedLength(claude) > AGY_COMMAND_CHARS, 'the unshrunk prompt really is too long once escaped');
  const agy = buildPrompt({ ...args, agent: 'agy' });
  assert.ok(escapedLength(agy) <= AGY_COMMAND_CHARS, `${escapedLength(agy)} > ${AGY_COMMAND_CHARS}`);
  assert.match(agy, /CONVERSATION SO FAR/, 'only the conversation shrinks');
  assert.ok(claude.length > agy.length, 'stdin agents keep the full conversation budget');
});

test('a start that fails after making its worktree removes it again, so the name can be reused', () => {
  const { dataDir, buildsRoot } = tempRoom();
  const repo = join(dataDir, '..', 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, '.ascend'), 'a file where the room wants a folder');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  const opts = { dataDir, settings: { ...testSettings(buildsRoot), debateFolders: [repo] }, runTurn: fakeRunTurn(() => ({ text: 'x' })) };
  const body = { project: 'fails', repo, task: 't', roles: TWO, attachments: [{ name: 'a.md', data: Buffer.from('x').toString('base64') }] };
  assert.throws(() => RoomSession.create(opts, body));
  assert.equal(git(repo, 'branch', '--list', 'room/*').stdout.trim(), '', 'its branch is gone');
  assert.equal(git(repo, 'worktree', 'list').stdout.trim().split('\n').length, 1, 'its worktree is gone');
  const projectBody = { project: 'fresh', task: 't', roles: TWO, attachments: body.attachments };
  mkdirSync(join(buildsRoot, 'fresh', '.ascend'), { recursive: true });
  rmSync(join(buildsRoot, 'fresh'), { recursive: true });
  assert.ok(RoomSession.create(opts, projectBody), 'a new project with the same kind of start still works');
});

test('stopping still succeeds, with a room line, when cleaning up fails', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: json({ tasks: [{ title: 'T', assignee: 'claude', description: 'd' }] }) })) },
    { project: 'gone', task: 't', roles: TWO });
  await s.kick();
  rmSync(s.state.projectDir, { recursive: true, force: true });
  await s.stop();
  assert.equal(s.state.stage, 'stopped');
  assert.ok(s.transcript.some(m => m.text.startsWith('Stopped, but cleaning up failed:')));
  assert.equal(existsSync(s.state.projectDir), false);
});
