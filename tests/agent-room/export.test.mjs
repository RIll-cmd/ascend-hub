import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { sessionMarkdown } from '../../scripts/agent-room/export.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const PLAN = { tasks: [{ title: 'Write hello', assignee: 'claude', description: 'd' }] };

async function finishedBuild() {
  const { dataDir, buildsRoot } = tempRoom();
  const respond = ({ stage, emit }) => {
    if (stage === 'plan') {
      emit({ type: 'turn.completed', usage: { input_tokens: 1200, output_tokens: 34 } });
      return { text: json(PLAN) };
    }
    if (stage === 'build') return { text: 'Wrote hello.js.', files: { 'hello.js': 'module.exports = () => "hi";\n' } };
    if (stage === 'finish') return { text: '# Summary\nhello.js returns hi.\n```json\n{"memory": ["Use CommonJS"]}\n```' };
    throw new Error(stage);
  };
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) };
  const s = RoomSession.create(opts, { project: 'hello', task: 'Make hello.js\nIt returns hi.', roles: ROLES, check: 'node -e "require(\'./hello.js\')"' });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  await s.gate({ gate: 'result', decision: 'accept' });
  return { s, opts };
}

test('a build exports its facts, task, plan, summary without the memory block, and every message', async () => {
  const { s } = await finishedBuild();
  const md = sessionMarkdown(s.state, s.transcript);
  assert.match(md, /^# Make hello\.js\n\n- \*\*Session:\*\* \d+-[0-9a-f]{6} · feature · done\n/);
  assert.match(md, /- \*\*Roles:\*\* orchestrator Codex, coders Claude, no reviewer\n/);
  assert.match(md, /- \*\*Checks:\*\* `node -e "require\('\.\/hello\.js'\)"`\n/);
  assert.match(md, /- \*\*Usage:\*\* Codex 2 turns, 1,234 tokens; Claude 1 turn, 0 tokens\n/);
  assert.match(md, /## Task\n\nMake hello\.js\nIt returns hi\.\n/);
  assert.match(md, /## Plan\n\n1\. \*\*Write hello\*\* \(Claude\): done, commit [0-9a-f]{7}, checks passed\n/);
  assert.match(md, /## Summary\n\n# Summary\nhello\.js returns hi\.\n/);
  assert.ok(!md.split('## Transcript')[0].includes('"memory"'), 'the summary leaves out the memory json');
  assert.match(md, new RegExp(`## Transcript \\(${s.transcript.length} messages\\)`));
  assert.match(md, /### \d{4}-\d\d-\d\d \d\d:\d\d UTC · Claude to Codex\n\nWrote hello\.js\./);
  assert.match(md, /### [^\n]+ · Room\n\nOwner accepted the result\.\n$/);
});

test('a debate exports its question, judge and verdict', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(({ stage, agent }) => ({ text: stage === 'verdict' ? '## Recommendation\nSQLite.' : `${agent} says` })) };
  mkdirSync(join(buildsRoot, 'x'), { recursive: true });
  const s = RoomSession.createDebate(opts, { question: 'Postgres or SQLite?', folder: join(buildsRoot, 'x'), judge: 'claude' });
  await s.kick();
  const md = sessionMarkdown(s.state, s.transcript);
  assert.match(md, /· debate · done\n/);
  assert.match(md, /- \*\*Judge:\*\* Claude\n/);
  assert.match(md, /## Question\n\nPostgres or SQLite\?\n\n## Verdict\n\n## Recommendation\nSQLite\.\n/);
  assert.ok(!md.includes('## Plan') && !md.includes('## Summary'));
});

test('the room exports a session with its whole transcript, past the 200 messages the page holds', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const { s, opts } = await finishedBuild();
  for (let i = 0; i < 210; i++) s.say('room', `note ${i}`);
  const room = await startRoomServer({ ...opts, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = path => fetch(`http://127.0.0.1:${room.port}${path}`, { headers: { authorization: `Bearer ${room.token}` } });
    const { markdown } = await (await call(`/sessions/${s.state.id}/export`)).json();
    assert.match(markdown, /note 0\n/);
    assert.match(markdown, /note 209\n$/);
    assert.match(markdown, /Wrote hello\.js\./, 'the earliest messages are there too');
    assert.equal((await call('/sessions/..%2Fx/export')).status, 400);
    assert.equal((await call('/sessions/1-abcdef/export')).status, 404);
  } finally {
    await room.close();
  }
});
