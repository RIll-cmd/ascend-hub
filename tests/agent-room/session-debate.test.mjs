import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, tempRoom, testSettings } from './helpers.mjs';

function setup(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const folder = join(dataDir, '..', 'repo');
  mkdirSync(folder, { recursive: true });
  const settings = { ...testSettings(buildsRoot), debateFolders: [folder], timeouts: { chat: 1000, build: 1000, debate: 4321 } };
  const calls = [];
  return { calls, folder, buildsRoot, opts: { dataDir, settings, runTurn: fakeRunTurn(respond, calls) } };
}

const say = ({ agent, stage }) => ({ text: stage === 'verdict' ? `## Where they agree\nall (${agent})` : `${agent} ${stage}` });

test('a debate runs opening, critique and verdict read-only in the chosen folder, then is done', async () => {
  const { calls, folder, buildsRoot, opts } = setup(say);
  const session = RoomSession.create(opts, { mode: 'debate', question: 'FTS or not?', folder, judge: 'claude' });
  await session.kick();
  assert.deepEqual(calls.map(c => `${c.agent}:${c.stage}`), [
    'codex:opening', 'claude:opening', 'agy:opening', 'codex:critique', 'claude:critique', 'agy:critique', 'claude:verdict',
  ]);
  assert.ok(calls.every(c => c.mode === 'read' && c.cwd === folder && c.timeoutMs === 4321));
  assert.doesNotMatch(calls[1].prompt, /codex opening/, 'openings are independent');
  assert.doesNotMatch(calls[2].prompt, /claude opening/);
  assert.match(calls[3].prompt, /ANTIGRAVITY: agy opening/);
  assert.match(calls[6].prompt, /CLAUDE: claude critique/);
  assert.equal(session.state.stage, 'done');
  assert.equal(session.state.answer, '## Where they agree\nall (claude)');
  assert.equal(readFileSync(join(session.dir, 'answer.md'), 'utf8'), '## Where they agree\nall (claude)\n');
  assert.equal(existsSync(join(folder, '.git')), false, 'no git repo made in the folder');
  assert.equal(existsSync(buildsRoot), false, 'no build project made');
  assert.equal(session.view().mode, 'debate');
});

test('debate input is validated before anything runs', () => {
  const { folder, opts } = setup(say);
  assert.throws(() => RoomSession.create(opts, { mode: 'debate', question: '', folder }), { code: 'QUESTION_INVALID' });
  assert.throws(() => RoomSession.create(opts, { mode: 'debate', question: 'x'.repeat(4001), folder }), { code: 'QUESTION_INVALID' });
  assert.throws(() => RoomSession.create(opts, { mode: 'debate', question: 'q', folder, judge: 'gpt' }), { code: 'JUDGE_INVALID' });
  assert.throws(() => RoomSession.create(opts, { mode: 'debate', question: 'q', folder: 'C:\\Windows' }), { code: 'FOLDER_NOT_ALLOWED' });
  assert.equal(RoomSession.create(opts, { mode: 'debate', question: 'q', folder }).state.judge, 'codex');
});

test('stopping a debate never rolls back or cleans the folder it reads', async () => {
  let release;
  const started = new Promise(resolve => { release = resolve; });
  const { folder, opts } = setup(({ signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ aborted: true }));
    release();
  }));
  spawnSync('git', ['init', '-q'], { cwd: folder });
  writeFileSync(join(folder, 'owner-work.txt'), 'uncommitted work of the owner');
  const session = RoomSession.create(opts, { mode: 'debate', question: 'q', folder });
  const loop = session.kick();
  await started;
  await session.stop();
  await loop;
  assert.equal(session.state.stage, 'stopped');
  assert.equal(readFileSync(join(folder, 'owner-work.txt'), 'utf8'), 'uncommitted work of the owner');
  assert.deepEqual(readdirSync(folder).sort(), ['.git', 'owner-work.txt']);
});

test('a restarted room resumes a debate at the turn it reached', async () => {
  const { calls, folder, opts } = setup(say);
  const session = RoomSession.create(opts, { mode: 'debate', question: 'q', folder });
  session.state.stage = 'critique';
  session.state.debateTurns = 4;
  session.save();
  const restored = RoomSession.load({ settings: opts.settings, runTurn: opts.runTurn }, session.dir);
  await restored.kick();
  assert.deepEqual(calls.map(c => `${c.agent}:${c.stage}`), ['claude:critique', 'agy:critique', 'codex:verdict']);
  assert.equal(restored.state.stage, 'done');
});
