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

test('search finds sessions by every word in their task, transcript or verdict, with where it matched', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const { dataDir, buildsRoot } = tempRoom();
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })) };
  const build = RoomSession.create(opts, { project: 'shop', task: 'Add a cart page', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  build.say('claude', 'I stored the cart in localStorage so a reload keeps it.');
  await build.stop();
  await new Promise(r => setTimeout(r, 5));
  const debate = RoomSession.createDebate(opts, { question: 'Postgres or SQLite for the cart?', folder: join(buildsRoot, 'shop') });
  debate.state.answer = '## Recommendation\nUse SQLite until traffic grows.';
  debate.state.stage = 'done';
  debate.save();
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const search = async q => {
      const res = await fetch(`http://127.0.0.1:${room.port}/sessions?q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${room.token}` } });
      return res.ok ? (await res.json()).sessions : res.status;
    };
    assert.deepEqual((await search('CART')).map(s => s.id), [debate.state.id, build.state.id], 'any case, newest first');
    const [hit] = await search('localstorage reload');
    assert.equal(hit.id, build.state.id);
    assert.deepEqual(hit.match, { from: 'claude', snippet: 'I stored the cart in localStorage so a reload keeps it.' });
    assert.deepEqual((await search('traffic sqlite')).map(s => s.match.from), ['verdict'], 'every word must appear; the snippet is where the first word is');
    assert.deepEqual(await search('postgres reload'), [], 'words from different sessions do not combine');
    assert.equal(await search('x'), 400);
  } finally {
    await room.close();
  }
});
