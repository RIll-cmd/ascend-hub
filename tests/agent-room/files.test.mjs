import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { commitAll, excludeFromGit, projectFile, projectFiles } from '../../scripts/agent-room/project.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };

function project() {
  const { dataDir, buildsRoot } = tempRoom();
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })) };
  const s = RoomSession.create(opts, { project: 'viewer', task: 't', roles: ROLES });
  const dir = s.state.projectDir;
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.env\n');
  writeFileSync(join(dir, '.env'), 'SECRET=1\n');
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'x', 'index.js'), 'x');
  excludeFromGit(dir, '.ascend/');
  mkdirSync(join(dir, '.ascend'));
  writeFileSync(join(dir, '.ascend', 'skill.md'), 'x');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'app.js'), 'console.log("hi");\n');
  writeFileSync(join(dir, 'pic.bin'), Buffer.from([1, 0, 2]));
  writeFileSync(join(dir, 'big.txt'), 'a'.repeat(600 * 1024));
  return { s, dir, opts, buildsRoot };
}

test('the file list holds tracked and new files, never ignored or excluded ones', () => {
  const { dir } = project();
  const { files, more } = projectFiles(dir);
  assert.deepEqual(files, ['.gitignore', 'big.txt', 'pic.bin', 'src/app.js']);
  assert.equal(more, 0);
});

test('the viewer reads only listed regular files, and names binary and large ones without their text', () => {
  const { dir } = project();
  assert.deepEqual(projectFile(dir, 'src/app.js'), { path: 'src/app.js', size: 19, text: 'console.log("hi");\n' });
  assert.equal(projectFile(dir, 'pic.bin').binary, true);
  assert.equal(projectFile(dir, 'big.txt').tooLarge, true);
  assert.equal(projectFile(dir, 'big.txt').text, undefined);
  for (const bad of ['.env', 'node_modules/x/index.js', '.ascend/skill.md', '../viewer/src/app.js', 'src', join(dir, 'src', 'app.js'), 'missing.js', null]) {
    assert.throws(() => projectFile(dir, bad), /FILE_NOT_LISTED/, String(bad));
  }
});

test('the room serves a build session\'s files, and refuses debates and unlisted paths', async () => {
  const { s, dir, opts, buildsRoot } = project();
  commitAll(dir, 'files'); // stopping rolls back anything uncommitted
  await s.stop();
  mkdirSync(join(buildsRoot, 'other'));
  const debate = RoomSession.createDebate(opts, { question: 'q?', folder: join(buildsRoot, 'other') });
  await debate.stop();
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = path => fetch(`http://127.0.0.1:${room.port}${path}`, { headers: { authorization: `Bearer ${room.token}` } });
    const list = await (await call(`/sessions/${s.state.id}/files`)).json();
    assert.ok(list.files.includes('src/app.js') && !list.files.includes('.env'));
    const file = await (await call(`/sessions/${s.state.id}/file?path=${encodeURIComponent('src/app.js')}`)).json();
    assert.equal(file.text, 'console.log("hi");\n');
    assert.equal((await call(`/sessions/${s.state.id}/file?path=.env`)).status, 400);
    assert.equal((await call(`/sessions/${debate.state.id}/files`)).status, 404, 'a debate folder is the owner\'s checkout');
    assert.equal((await call('/sessions/x/files')).status, 400);
  } finally {
    await room.close();
  }
});
