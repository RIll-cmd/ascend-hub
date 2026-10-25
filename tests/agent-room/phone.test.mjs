import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanNotify } from '../../scripts/agent-room/notify.mjs';
import { newCode, parseReply, phoneActions, phoneChoices } from '../../scripts/agent-room/phone.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const NOTIFY = { ntfy: 'https://ntfy.sh/room-x', answer: true, reply: 'https://ntfy.sh/room-x-reply' };
const respond = ({ stage }) => ({ plan: { text: json({ tasks: [{ title: 'T', assignee: 'claude', description: 'd' }] }) }, build: { text: 'ok', files: { 'a.txt': 'a' } }, finish: { text: 'Done.' } })[stage] ?? { text: 'x' };

test('replies are a decision, the six-character code and an optional note; anything else is ignored', () => {
  assert.deepEqual(parseReply('approve k7q2xm'), { decision: 'approve', code: 'K7Q2XM', note: '' });
  assert.deepEqual(parseReply('  Revise K7Q2XM make task 2 smaller\nplease'), { decision: 'revise', code: 'K7Q2XM', note: 'make task 2 smaller\nplease' });
  for (const text of ['merge K7Q2XM', 'approve', 'approve K7Q2X', 'approve K7Q2XMM', 'hello', '', null]) assert.equal(parseReply(text), null, String(text));
  assert.match(newCode(), /^[A-HJ-NP-Z2-9]{6}$/);
});

test('the phone may approve, ask for changes, keep a result, retry or stop; merging, pull requests and rejecting stay on the PC', () => {
  assert.deepEqual(phoneChoices({ kind: 'gate', gate: 'plan' }), ['approve', 'revise', 'stop']);
  assert.deepEqual(phoneChoices({ kind: 'gate', gate: 'race' }), ['approve', 'stop']);
  assert.deepEqual(phoneChoices({ kind: 'gate', gate: 'result' }), ['keep']);
  assert.deepEqual(phoneChoices({ kind: 'pause' }), ['retry', 'stop']);
  assert.deepEqual(phoneChoices(null), []);
  const { actions, line } = phoneActions({ kind: 'gate', gate: 'plan' }, 'K7Q2XM', NOTIFY.reply);
  assert.equal(actions, 'http, Approve, https://ntfy.sh/room-x-reply, method=POST, body=approve K7Q2XM, clear=true; http, Stop, https://ntfy.sh/room-x-reply, method=POST, body=stop K7Q2XM, clear=true');
  assert.equal(line, 'Code K7Q2XM. To ask for changes, publish "revise K7Q2XM <what to change>" to https://ntfy.sh/room-x-reply.');
});

test('answering is opt-in and needs its own reply topic', () => {
  const warnings = [];
  const warn = w => warnings.push(w);
  assert.deepEqual(cleanNotify({ ntfy: 'https://ntfy.sh/room-x' }, warn), { ntfy: 'https://ntfy.sh/room-x' });
  assert.deepEqual(cleanNotify({ ntfy: 'https://ntfy.sh/room-x', answer: true }, warn), NOTIFY);
  assert.deepEqual(cleanNotify({ ntfy: 'https://ntfy.sh/room-x', answer: true, reply: 'https://ntfy.sh/other' }, warn).reply, 'https://ntfy.sh/other');
  assert.deepEqual(cleanNotify({ ntfy: 'https://ntfy.sh/room-x', answer: true, reply: 'https://ntfy.sh/room-x' }, warn), { ntfy: 'https://ntfy.sh/room-x' });
  assert.deepEqual(cleanNotify({ ntfy: 'https://ntfy.sh/room-x', answer: 'yes' }, warn), { ntfy: 'https://ntfy.sh/room-x' });
  assert.equal(warnings.length, 2);
});

function session(notify = NOTIFY) {
  const { dataDir, buildsRoot } = tempRoom();
  const s = RoomSession.create({ dataDir, settings: { ...testSettings(buildsRoot), notify }, runTurn: fakeRunTurn(respond) }, { project: 'phone', task: 't', roles: ROLES });
  return { s, dataDir, buildsRoot };
}

test('each wait gets a one-time code; the right code answers once, wrong codes lock the phone out', async () => {
  const { s } = session();
  await s.kick();
  assert.equal(s.state.stage, 'gate-plan');
  const { code } = s.state.phone;
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal(s.phoneAnswer({ decision: 'merge', code, note: '' }).ok, false);
  assert.equal(s.phoneAnswer({ decision: 'revise', code, note: '' }).text, 'Add what to change after the code.');
  for (let i = 0; i < 4; i++) assert.equal(s.phoneAnswer({ decision: 'approve', code: 'AAAAAA', note: '' }).text, 'That code does not match this step.');
  const loop = s.phoneAnswer({ decision: 'approve', code, note: '' });
  assert.deepEqual(loop, { ok: true, text: 'Done: approve (phone).' });
  assert.ok(s.transcript.some(m => m.text === 'Owner answered from the phone: approve.'));
  assert.equal(s.phoneAnswer({ decision: 'approve', code, note: '' }).ok, false, 'a code works once');
  await s.loop;
  assert.equal(s.state.stage, 'gate-result');
  const result = s.state.phone.code;
  assert.notEqual(result, code, 'a new wait has a new code');
  for (let i = 0; i < 5; i++) s.phoneAnswer({ decision: 'keep', code: 'BBBBBB', note: '' });
  assert.equal(s.phoneAnswer({ decision: 'keep', code: result, note: '' }).text, 'Answering from the phone is locked for this step; answer on the Hub page.');
  assert.ok(s.transcript.some(m => /5 wrong codes from the phone/.test(m.text)));
  assert.equal(s.state.stage, 'gate-result', 'the result still waits for the Hub page');
});

test('without answering switched on no code is issued and nothing is accepted', async () => {
  const { s } = session({ ntfy: 'https://ntfy.sh/room-x' });
  await s.kick();
  assert.equal(s.state.phone, undefined);
  assert.equal(s.phoneAnswer({ decision: 'approve', code: 'AAAAAA', note: '' }).ok, false);
});

test('through the room: the gate push carries buttons with the code, a reply on the reply topic answers it, and the outcome is pushed back', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const pushes = [];
  let replyLines = '';
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'POST') { pushes.push({ url, body: init.body, headers: init.headers }); return { ok: true }; }
    assert.match(url, /^https:\/\/ntfy\.sh\/room-x-reply\/json\?poll=1&since=/);
    const text = replyLines;
    replyLines = '';
    return { ok: true, text: async () => text };
  };
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const room = await startRoomServer({ dataDir, settings: { ...testSettings(buildsRoot), notify: NOTIFY }, runTurn: fakeRunTurn(respond), fetchImpl,
    probe: async () => ({ state: 'ready' }), port: 0, replyMs: 60_000 });
  try {
    await new Promise(r => setTimeout(r, 50));
    const res = await fetch(`http://127.0.0.1:${room.port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${room.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'phone', task: 't', roles: ROLES }) });
    assert.equal(res.status, 201);
    for (let i = 0; i < 100 && room.getSession().state.stage !== 'gate-plan'; i++) await new Promise(r => setTimeout(r, 30));
    const gatePush = pushes.find(p => p.headers.Title === 'Agent Room: plan gate');
    const { code } = room.getSession().state.phone;
    assert.match(gatePush.headers.Actions, new RegExp(`body=approve ${code}, clear=true`));
    assert.match(gatePush.body, new RegExp(`Code ${code}\\.`));
    replyLines = `${JSON.stringify({ id: 'm1', event: 'open' })}\n${JSON.stringify({ id: 'm2', event: 'message', message: 'hello' })}\n${JSON.stringify({ id: 'm3', event: 'message', message: `approve ${code}` })}\n`;
    await room.pollReplies();
    for (let i = 0; i < 100 && room.getSession().state.stage !== 'gate-result'; i++) await new Promise(r => setTimeout(r, 30));
    assert.equal(room.getSession().state.stage, 'gate-result');
    assert.ok(pushes.some(p => p.body === 'Done: approve (phone).'));
  } finally {
    await room.close();
  }
});
