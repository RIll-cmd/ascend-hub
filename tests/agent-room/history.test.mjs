import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, tempRoom, testSettings } from './helpers.mjs';

test('the room lists past sessions newest first and opens one read-only', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const { dataDir, buildsRoot } = tempRoom();
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })) };
  const older = RoomSession.create(opts, { project: 'older-app', task: 'Build the first thing\nwith details', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  await older.stop();
  await new Promise(r => setTimeout(r, 5));
  const newer = RoomSession.createDebate(opts, { question: 'Which database?', folder: join(buildsRoot, 'older-app') });
  newer.state.stage = 'done';
  newer.save();
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = path => fetch(`http://127.0.0.1:${room.port}${path}`, { headers: { authorization: `Bearer ${room.token}` } });
    const { sessions } = await (await call('/sessions')).json();
    assert.deepEqual(sessions.map(s => [s.id, s.mode, s.project, s.stage]), [
      [newer.state.id, 'debate', 'older-app', 'done'],
      [older.state.id, 'build', 'older-app', 'stopped'],
    ]);
    assert.equal(sessions[1].title, 'Build the first thing');
    const { session } = await (await call(`/sessions/${older.state.id}`)).json();
    assert.equal(session.id, older.state.id);
    assert.ok(session.transcript.some(m => /Owner stopped the session/.test(m.text)));
    assert.equal((await call('/sessions/..%2F..%2Fsecret')).status, 400);
    assert.equal((await call('/sessions/1-abcdef')).status, 404);
  } finally {
    await room.close();
  }
});
