import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import test from 'node:test';
import { startRoomServer } from '../../scripts/agent-room/server.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };

async function boot({ probe = async () => ({ state: 'ready' }), respond } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const runTurn = fakeRunTurn(respond ?? (({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] }) } : { text: 'x' })));
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), runTurn, probe, port: 0 });
  const call = (method, path, body, token = room.token) => fetch(`http://127.0.0.1:${room.port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { room, call, dataDir };
}

test('writes server.json, requires the token, removes server.json on close', async () => {
  const { room, call, dataDir } = await boot();
  const info = JSON.parse(readFileSync(join(dataDir, 'server.json'), 'utf8'));
  assert.equal(info.port, room.port);
  assert.equal(info.token, room.token);
  assert.equal((await call('GET', '/status', undefined, 'wrong')).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${room.port}/status`)).status, 401);
  await room.close();
  assert.equal(existsSync(join(dataDir, 'server.json')), false);
});

test('uses a supplied token so Hub can share it through .env.local', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), probe: async () => ({ state: 'ready' }), port: 0, token: 'shared-secret' });
  assert.equal(room.token, 'shared-secret');
  const res = await fetch(`http://127.0.0.1:${room.port}/status`, { headers: { authorization: 'Bearer shared-secret' } });
  assert.equal(res.status, 200);
  await room.close();
});

test('a second room on a taken port touches nothing before failing', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const settings = testSettings(buildsRoot);
  RoomSession.create({ dataDir, settings, runTurn: async () => { throw new Error('unused'); } }, { project: 'live', task: 't' });
  const blocker = createServer().listen(0, '127.0.0.1');
  await once(blocker, 'listening');
  const calls = [];
  const probes = [];
  await assert.rejects(startRoomServer({
    dataDir, settings, runTurn: fakeRunTurn(() => ({ text: 'x' }), calls),
    probe: async id => { probes.push(id); return { state: 'ready' }; }, port: blocker.address().port,
  }), { code: 'EADDRINUSE' });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(calls, []);
  assert.deepEqual(probes, []);
  blocker.close();
});

test('status reports agent availability and refuses to start until all are ready', async () => {
  const { room, call } = await boot({ probe: async id => (id === 'agy' ? { state: 'offline', detail: 'not signed in' } : { state: 'ready' }) });
  await new Promise(resolve => setTimeout(resolve, 20));
  const status = await (await call('GET', '/status')).json();
  assert.deepEqual(status.agents.agy, { state: 'offline', detail: 'not signed in' });
  assert.equal(status.agents.codex.state, 'ready');
  const res = await call('POST', '/sessions', { project: 'p', task: 't', roles: ROLES });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'AGENTS_NOT_READY');
  await room.close();
});

test('one session at a time; gate, view and stop through the API', async () => {
  const { room, call } = await boot();
  await new Promise(resolve => setTimeout(resolve, 20));
  const created = await call('POST', '/sessions', { project: 'p', task: 't', roles: ROLES });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/sessions', { project: 'q', task: 't' })).status, 409);
  await room.getSession().loop;
  const view = (await (await call('GET', '/sessions/current')).json()).session;
  assert.equal(view.stage, 'gate-plan');
  assert.ok(Array.isArray(view.transcript));
  const badGate = await call('POST', '/sessions/current/gate', { gate: 'roles', decision: 'approve' });
  assert.equal(badGate.status, 400);
  assert.equal((await badGate.json()).error, 'GATE_NOT_OPEN');
  assert.equal((await call('POST', '/sessions/current/stop', {})).status, 200);
  assert.equal(room.getSession().state.stage, 'stopped');
  assert.equal((await call('POST', '/sessions', { project: 'p', task: 't' })).status, 409, 'project folder already exists');
  await room.close();
});

test('rejects bad bodies and unknown routes', async () => {
  const { room, call } = await boot();
  const bad = await fetch(`http://127.0.0.1:${room.port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${room.token}` }, body: '[1]' });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/sessions', { project: 'p', task: 'x'.repeat(70_000) })).status, 413);
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('POST', '/sessions/current/stop', {})).status, 404);
  await room.close();
});

test('restores an unfinished session from disk on start', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const settings = testSettings(buildsRoot);
  const runTurn = fakeRunTurn(({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] }) } : { text: 'x' }));
  const first = await startRoomServer({ dataDir, settings, runTurn, probe: async () => ({ state: 'ready' }), port: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));
  await fetch(`http://127.0.0.1:${first.port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${first.token}` }, body: JSON.stringify({ project: 'p', task: 't', roles: ROLES }) });
  await first.getSession().loop;
  await first.close();
  const second = await startRoomServer({ dataDir, settings, runTurn, probe: async () => ({ state: 'ready' }), port: 0 });
  assert.equal(second.getSession().state.stage, 'gate-plan');
  await second.close();
});

test('status lists debate folders and a debate session starts through the API', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const folder = join(dataDir, '..', 'repo');
  mkdirSync(folder, { recursive: true });
  const settings = { ...testSettings(buildsRoot), debateFolders: [folder], timeouts: { chat: 1000, build: 1000, debate: 1000 } };
  const runTurn = fakeRunTurn(({ agent, stage }) => ({ text: `${agent} ${stage}` }));
  const room = await startRoomServer({ dataDir, settings, runTurn, probe: async () => ({ state: 'ready' }), port: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));
  const call = (method, path, body) => fetch(`http://127.0.0.1:${room.port}${path}`, {
    method, headers: { authorization: `Bearer ${room.token}` }, body: body && JSON.stringify(body),
  });
  assert.deepEqual((await (await call('GET', '/status')).json()).folders, [folder]);
  const created = await call('POST', '/sessions', { mode: 'debate', question: 'q', folder, judge: 'agy' });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).session.mode, 'debate');
  await room.getSession().loop;
  const view = (await (await call('GET', '/sessions/current')).json()).session;
  assert.equal(view.stage, 'done');
  assert.equal(view.answer, 'agy verdict');
  const bad = await call('POST', '/sessions', { mode: 'debate', question: 'q', folder: 'C:\Windows' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'FOLDER_NOT_ALLOWED');
  await room.close();
});
