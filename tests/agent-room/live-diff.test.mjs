import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { excludeFromGit, workingDiff } from '../../scripts/agent-room/project.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ascend-live-diff-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'app.js'), 'hello\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

test('the working diff shows edits and new files, names binary files, skips excluded ones and leaves the index alone', () => {
  const dir = repo();
  assert.deepEqual(workingDiff(dir), { files: 0, text: '' });
  writeFileSync(join(dir, 'app.js'), 'hello world\n');
  writeFileSync(join(dir, 'new.js'), 'a\nb\n');
  writeFileSync(join(dir, 'pic.bin'), Buffer.from([1, 0, 2]));
  excludeFromGit(dir, '.ascend/');
  mkdirSync(join(dir, '.ascend'));
  writeFileSync(join(dir, '.ascend', 'skill.md'), 'x');
  const index = statSync(join(dir, '.git', 'index')).mtimeMs;
  const { files, text } = workingDiff(dir);
  assert.equal(files, 3);
  assert.match(text, /-hello\n\+hello world/);
  assert.match(text, /diff --git a\/new\.js b\/new\.js\nnew file\n--- \/dev\/null\n\+\+\+ b\/new\.js\n\+a\n\+b\n/);
  assert.match(text, /new file pic\.bin \(binary, large or unreadable\)/);
  assert.ok(!text.includes('.ascend'));
  assert.equal(statSync(join(dir, '.git', 'index')).mtimeMs, index, 'reading never rewrites the index');
  assert.match(git(dir, 'status', '--porcelain').stdout, /\?\? new\.js/, 'new files stay untracked');
});

test('a running build shows its task and the coder\'s uncommitted edits; debates and finished sessions do not', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  let seen = null;
  let session;
  const respond = ({ stage, cwd }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'Write a', assignee: 'claude', description: 'd' }] }) };
    if (stage === 'build') {
      writeFileSync(join(cwd, 'a.txt'), 'draft\n');
      seen = session.liveDiff();
      return { text: 'done', files: { 'a.txt': 'final\n' } };
    }
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  };
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) };
  session = RoomSession.create(opts, { project: 'live', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.deepEqual(seen.task, { id: 1, title: 'Write a', assignee: 'claude' });
  assert.equal(seen.agent, 'claude');
  assert.equal(seen.activity, 'editing');
  assert.equal(seen.elsewhere, false);
  assert.equal(seen.files, 1);
  assert.match(seen.text, /\+\+\+ b\/a\.txt\n\+draft/);
  assert.equal(session.liveDiff().files, 0, 'committed work is no longer live');

  mkdirSync(join(buildsRoot, 'folder'), { recursive: true });
  const debate = RoomSession.createDebate(opts, { question: 'q?', folder: join(buildsRoot, 'folder') });
  assert.throws(() => debate.liveDiff(), /LIVE_DIFF_BUILD_ONLY/);
  await debate.stop();

  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  await session.gate({ gate: 'result', decision: 'accept' });
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const res = await fetch(`http://127.0.0.1:${room.port}/sessions/current/live-diff`, { headers: { authorization: `Bearer ${room.token}` } });
    assert.equal(res.status, 404, 'no running session');
  } finally {
    await room.close();
  }
});
