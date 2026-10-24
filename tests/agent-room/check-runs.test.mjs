import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCheck } from '../../scripts/agent-room/project.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };

test('a check keeps its whole output for the pane and only the tail for the agents', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ascend-check-'));
  const result = await runCheck(dir, 'node -e "for (let i = 0; i < 2000; i++) console.log(\'line \' + i)"');
  assert.equal(result.ok, true);
  assert.ok(result.output.length <= 6000);
  assert.ok(!result.output.includes('line 0\n'));
  assert.match(result.log, /^line 0\r?\nline 1\r?\n/);
  assert.match(result.log, /line 1999\r?\n$/);
});

test('every check run is saved with what it checked, and the room serves its full output', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  let builds = 0;
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'Make ok', assignee: 'claude', description: 'd' }] }) };
    if (stage === 'build') { builds += 1; return { text: 'done', files: builds === 1 ? { 'no.txt': 'x' } : { 'ok.txt': 'x' } }; }
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  };
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) };
  const check = 'node -e "console.log(\'checking\'); process.exit(require(\'fs\').existsSync(\'ok.txt\') ? 0 : 1)"';
  const s = RoomSession.create(opts, { project: 'checks', task: 't', roles: ROLES, check });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(s.state.stage, 'gate-result');
  const runs = s.state.checkRuns;
  assert.deepEqual(runs.map(r => [r.n, r.label, r.ok, r.code, r.command]), [[1, 'task 1', false, 1, check], [2, 'task 1', true, 0, check]]);
  assert.ok(runs.every(r => r.ms >= 0 && r.chars > 0 && !Number.isNaN(Date.parse(r.at))));
  assert.match(readFileSync(join(s.dir, 'checks', '1.log'), 'utf8'), /^checking/);
  assert.equal(s.state.plan.tasks[0].check.log, undefined, 'the full log stays out of the session state');

  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = path => fetch(`http://127.0.0.1:${room.port}${path}`, { headers: { authorization: `Bearer ${room.token}` } });
    const body = await (await call(`/sessions/${s.state.id}/checks/2`)).json();
    assert.equal(body.run.label, 'task 1');
    assert.equal(body.run.ok, true);
    assert.match(body.output, /^checking/);
    assert.equal((await call(`/sessions/${s.state.id}/checks/9`)).status, 404);
    assert.equal((await call('/sessions/1-zzzzzz/checks/1')).status, 400);
  } finally {
    await room.close();
  }
  assert.ok(existsSync(join(s.dir, 'checks', '2.log')));
});
