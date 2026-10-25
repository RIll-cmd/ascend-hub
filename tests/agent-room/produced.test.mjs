import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { producedBlob, producedFiles, producedZip } from '../../scripts/agent-room/project.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const BIN = Buffer.from([0, 1, 2, 255, 13, 10, 0]);

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ascend-produced-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'keep.txt'), 'untouched\n');
  writeFileSync(join(dir, 'edit.txt'), 'before\n');
  writeFileSync(join(dir, 'gone.txt'), 'bye\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  const base = git(dir, 'rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(dir, 'edit.txt'), 'after\n');
  rmSync(join(dir, 'gone.txt'));
  mkdirSync(join(dir, 'out'));
  writeFileSync(join(dir, 'out', 'logo.bin'), BIN);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'work');
  return { dir, base };
}

test('produced files are what the session\'s commits added, changed or deleted, with sizes at HEAD', () => {
  const { dir, base } = repo();
  assert.deepEqual(producedFiles(dir, base), { files: [
    { path: 'edit.txt', status: 'changed', size: 6 },
    { path: 'gone.txt', status: 'deleted', size: null },
    { path: 'out/logo.bin', status: 'added', size: BIN.length },
  ], more: 0 });
});

test('a download is the committed bytes of a listed file; anything else is refused', () => {
  const { dir, base } = repo();
  assert.ok(producedBlob(dir, base, 'out/logo.bin').equals(BIN));
  writeFileSync(join(dir, 'edit.txt'), 'uncommitted\n');
  assert.equal(producedBlob(dir, base, 'edit.txt').toString(), 'after\n', 'what was committed, not the working copy');
  for (const bad of ['keep.txt', 'gone.txt', '../edit.txt', 'out', '']) assert.throws(() => producedBlob(dir, base, bad), /FILE_NOT_LISTED/, bad);
  const zip = producedZip(dir, base);
  assert.equal(zip.subarray(0, 2).toString('latin1'), 'PK');
  assert.ok(zip.includes(Buffer.from('out/logo.bin')) && zip.includes(Buffer.from('edit.txt')) && !zip.includes(Buffer.from('keep.txt')));
});

test('the room lists and serves a finished build\'s files, and refuses debates', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'Logo', assignee: 'claude', description: 'd' }] }) };
    if (stage === 'build') return { text: 'done', files: { 'logo.bin': BIN, 'notes.md': '# Notes\n' } };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  };
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) };
  const s = RoomSession.create(opts, { project: 'made', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(s.state.stage, 'gate-result');
  mkdirSync(join(buildsRoot, 'other'));
  const debate = RoomSession.createDebate(opts, { question: 'q?', folder: join(buildsRoot, 'other') });
  await debate.stop();
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = path => fetch(`http://127.0.0.1:${room.port}${path}`, { headers: { authorization: `Bearer ${room.token}` } });
    const { files } = await (await call(`/sessions/${s.state.id}/produced`)).json();
    assert.deepEqual(files.map(f => [f.path, f.status]), [['PLAN.md', 'added'], ['SUMMARY.md', 'added'], ['logo.bin', 'added'], ['notes.md', 'added']]);
    const one = await call(`/sessions/${s.state.id}/produced/file?path=logo.bin`);
    assert.equal(one.headers.get('content-type'), 'application/octet-stream');
    assert.equal(one.headers.get('content-disposition'), 'attachment; filename="logo.bin"; filename*=UTF-8\'\'logo.bin');
    assert.ok(Buffer.from(await one.arrayBuffer()).equals(BIN));
    const zip = await call(`/sessions/${s.state.id}/produced/zip`);
    assert.equal(zip.headers.get('content-type'), 'application/zip');
    assert.match(zip.headers.get('content-disposition'), /filename="made-produced\.zip"/);
    assert.equal((await call(`/sessions/${s.state.id}/produced/file?path=..%2Fx`)).status, 400);
    assert.equal((await call(`/sessions/${debate.state.id}/produced`)).status, 404);
  } finally {
    await room.close();
  }
});
