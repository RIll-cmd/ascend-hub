import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { nextRun, RoomQueue } from '../../scripts/agent-room/queue.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const local = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'ascend-queue-')); return d; };

test('queued sessions persist, keep their order, can be removed, and never carry attachments', () => {
  const data = dir();
  const q = new RoomQueue(data);
  const a = q.add({ project: 'a', task: 'First\nmore' });
  q.add({ mode: 'debate', question: 'Which DB?' });
  assert.equal(a.title, 'First');
  const again = new RoomQueue(data);
  assert.deepEqual(again.items.map(i => i.title), ['First', 'Which DB?']);
  again.remove(a.id);
  assert.deepEqual(new RoomQueue(data).items.map(i => i.title), ['Which DB?']);
  assert.throws(() => again.remove('nope'), /QUEUE_ITEM_UNKNOWN/);
  assert.throws(() => again.add({ task: 't', attachments: [{ name: 'a.md', data: 'eA==' }] }), /QUEUE_NO_ATTACHMENTS/);
  assert.throws(() => again.add(null), /QUEUE_BODY_INVALID/);
  assert.equal(again.take().title, 'Which DB?');
  assert.equal(again.take(), null);
});

test('daily runs move a day, weekday runs skip the weekend, and missed runs jump to the next one after now', () => {
  const friday = new Date(local(2026, 10, 23)).toISOString();
  assert.equal(nextRun({ repeat: 'daily', nextRun: friday }, local(2026, 10, 23, 9, 1)), new Date(local(2026, 10, 24)).toISOString());
  assert.equal(nextRun({ repeat: 'weekdays', nextRun: friday }, local(2026, 10, 23, 9, 1)), new Date(local(2026, 10, 26)).toISOString(), 'Friday to Monday');
  assert.equal(nextRun({ repeat: 'daily', nextRun: friday }, local(2026, 10, 27, 12)), new Date(local(2026, 10, 28)).toISOString(), 'days missed while the room was down are skipped');
  assert.equal(nextRun({ repeat: 'once', nextRun: friday }), null);
});

test('schedules need a future time and a known repeat; due ones join the queue once, and once-schedules go', () => {
  const q = new RoomQueue(dir());
  const now = local(2026, 10, 24, 8);
  assert.throws(() => q.schedule({ body: { task: 't' }, at: new Date(now - 1000).toISOString() }, now), /SCHEDULE_INVALID/);
  assert.throws(() => q.schedule({ body: { task: 't' }, at: new Date(now + 1000).toISOString(), repeat: 'hourly' }, now), /SCHEDULE_INVALID/);
  const saturday = q.schedule({ body: { task: 'Nightly review' }, at: new Date(local(2026, 10, 24, 22)).toISOString(), repeat: 'weekdays' }, now);
  assert.equal(saturday.nextRun, new Date(local(2026, 10, 26, 22)).toISOString(), 'a weekend first run moves to Monday');
  q.schedule({ body: { task: 'Once' }, at: new Date(local(2026, 10, 24, 9)).toISOString() }, now);
  q.schedule({ body: { task: 'Daily' }, at: new Date(local(2026, 10, 24, 9)).toISOString(), repeat: 'daily' }, now);
  assert.deepEqual(q.due(local(2026, 10, 24, 8, 59)), []);
  assert.deepEqual(q.due(local(2026, 10, 24, 9, 0, 30)).map(s => s.title), ['Once', 'Daily']);
  assert.deepEqual(q.items.map(i => [i.title, i.source.startsWith('schedule:')]), [['Once', true], ['Daily', true]]);
  assert.deepEqual(q.schedules.map(s => [s.title, s.nextRun]), [
    ['Nightly review', new Date(local(2026, 10, 26, 22)).toISOString()], ['Daily', new Date(local(2026, 10, 25, 9)).toISOString()]]);
});

test('the room starts queued sessions one after another, keeps a failed start with its reason, and runs due schedules', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  mkdirSync(dataDir, { recursive: true });
  const respond = ({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'T', assignee: 'claude', description: 'd' }] }) } : { text: 'x' });
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond), probe: async () => ({ state: 'ready' }), port: 0, queueMs: 50 });
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${room.port}${path}`, { method, headers: { authorization: `Bearer ${room.token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const wait = async (check, ms = 15_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 50))) if (check()) return true;
    return false;
  };
  try {
    await new Promise(r => setTimeout(r, 50)); // probes settle
    assert.equal((await call('POST', '/sessions', { project: 'first', task: 'one', roles: ROLES })).status, 201);
    const queued = await call('POST', '/queue', { body: { project: 'second', task: 'two', roles: ROLES } });
    assert.equal(queued.status, 201);
    await call('POST', '/queue', { body: { project: 'bad name!', task: 'three', roles: ROLES } });
    assert.equal((await call('GET', '/queue')).data.items.length, 2, 'they wait while a session runs');
    await call('POST', '/sessions/current/stop', {});
    assert.ok(await wait(() => room.getSession()?.state.project === 'second'), 'the next one starts once the first ends');
    assert.ok(room.getSession().transcript.some(m => m.text === 'Started from the queue: two'));
    await call('POST', '/sessions/current/stop', {});
    let view = (await call('GET', '/queue')).data;
    for (let i = 0; i < 300 && !view.failed.length; i++) { await new Promise(r => setTimeout(r, 50)); view = (await call('GET', '/queue')).data; }
    assert.equal(view.items.length, 0, 'the bad one left the queue');
    assert.match(view.failed[0].error, /PROJECT_NAME_INVALID/, 'and kept its reason');

    const at = new Date(Date.now() + 300).toISOString();
    assert.equal((await call('POST', '/schedules', { body: { project: 'later', task: 'scheduled', roles: ROLES }, at })).status, 201);
    assert.ok(await wait(() => room.getSession()?.state.project === 'later'), 'a due schedule starts its session');
    assert.ok(room.getSession().transcript.some(m => m.text === 'Started from the queue by a schedule: scheduled'));
    assert.equal((await call('GET', '/queue')).data.schedules.length, 0, 'a once-schedule is gone after it ran');
    assert.equal((await call('POST', '/queue', { body: { task: 't', attachments: [{ name: 'a.md', data: 'eA==' }] } })).status, 400);
  } finally {
    await room.getSession()?.stop();
    await room.close();
  }
});
