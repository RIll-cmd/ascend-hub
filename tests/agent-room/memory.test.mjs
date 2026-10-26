import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { addNotes, cleanNotes, memoryKey, readMemory, splitProposal, writeMemory } from '../../scripts/agent-room/memory.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

test('notes are short single lines, at most five per proposal', () => {
  assert.deepEqual(cleanNotes([' Use pnpm, not npm. ', '', 7, 'x'.repeat(201), 'a\nb', 'one', 'two', 'three', 'four']),
    ['Use pnpm, not npm.', 'a b', 'one', 'two', 'three']);
  assert.deepEqual(cleanNotes('nope'), []);
});

test('the finish summary carries the proposed notes in a json block that is cut from SUMMARY.md', () => {
  const text = '# Summary\nBuilt it.\n```json\n{"memory": ["Run tests with node --test", "Keep exports ESM"]}\n```\n';
  assert.deepEqual(splitProposal(text), { summary: '# Summary\nBuilt it.', notes: ['Run tests with node --test', 'Keep exports ESM'], skill: null });
  assert.deepEqual(splitProposal('Plain summary.'), { summary: 'Plain summary.', notes: [], skill: null });
});

test('memory is stored per project outside the repo, deduplicated and capped at 60 lines', () => {
  const { dataDir } = tempRoom();
  assert.equal(memoryKey({ repo: { dir: 'D:\\ascend_hub' }, project: 'x' }), 'ascend_hub');
  assert.equal(memoryKey({ repo: null, project: 'todo-app' }), 'todo-app');
  assert.deepEqual(readMemory(dataDir, 'ascend_hub'), []);
  addNotes(dataDir, 'ascend_hub', ['Use node --test', 'Use node --test', 'Never edit dist/']);
  assert.deepEqual(readMemory(dataDir, 'ascend_hub'), ['Use node --test', 'Never edit dist/']);
  addNotes(dataDir, 'ascend_hub', Array.from({ length: 70 }, (_, i) => `note ${i}`));
  const lines = readMemory(dataDir, 'ascend_hub');
  assert.equal(lines.length, 60);
  assert.equal(lines.at(-1), 'note 69', 'the newest notes win');
  writeMemory(dataDir, 'ascend_hub', ['only this']);
  assert.deepEqual(readMemory(dataDir, 'ascend_hub'), ['only this']);
  assert.throws(() => readMemory(dataDir, '../escape'), /MEMORY_KEY_INVALID/);
});

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const respond = ({ stage }) => ({
  plan: { text: json({ tasks: [{ title: 'a', assignee: 'claude', description: '' }] }) },
  build: { text: 'ok', files: { 'a.txt': 'a' } },
  finish: { text: '# Done\nAll good.\n```json\n{"memory": ["Prefer small commits", "Tests live in tests/"]}\n```' },
})[stage];

async function finished(dataDir, buildsRoot, project, calls = []) {
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) }, { project, task: 't', roles: ROLES });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  return s;
}

test('the owner keeps only the notes they approve, and later sessions of that project see them', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const first = await finished(dataDir, buildsRoot, 'mem-app');
  assert.deepEqual(first.state.memoryProposal, ['Prefer small commits', 'Tests live in tests/']);
  assert.equal(readFileSync(join(first.state.projectDir, 'SUMMARY.md'), 'utf8').includes('json'), false);
  assert.deepEqual(first.view().attention.memory, ['Prefer small commits', 'Tests live in tests/']);
  await first.gate({ gate: 'result', decision: 'accept', memory: ['Prefer small commits (edited)'] });
  assert.deepEqual(readMemory(dataDir, 'mem-app'), ['Prefer small commits (edited)']);

  const rejected = await finished(dataDir, join(buildsRoot, 'b'), 'other-app');
  await rejected.gate({ gate: 'result', decision: 'reject', memory: ['should not be kept'] });
  assert.deepEqual(readMemory(dataDir, 'other-app'), [], 'a rejected result keeps no notes');

  const calls = [];
  const s = RoomSession.create({ dataDir, settings: testSettings(join(buildsRoot, 'c')), runTurn: fakeRunTurn(respond, calls) }, { project: 'mem-app', task: 't', roles: ROLES });
  await s.kick();
  assert.match(calls[0].prompt, /PROJECT MEMORY[\s\S]*Prefer small commits \(edited\)/);
});

test('the owner can read and rewrite a project memory through the room API', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const { dataDir, buildsRoot } = tempRoom();
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })), probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = (method, path, body) => fetch(`http://127.0.0.1:${room.port}${path}`, { method, headers: { authorization: `Bearer ${room.token}` }, body: body && JSON.stringify(body) });
    assert.deepEqual(await (await call('GET', '/memory?key=ascend_hub')).json(), { key: 'ascend_hub', notes: [] });
    const saved = await (await call('POST', '/memory', { key: 'ascend_hub', notes: ['Use node --test', ' '] })).json();
    assert.deepEqual(saved, { key: 'ascend_hub', notes: ['Use node --test'] });
    assert.deepEqual(readMemory(dataDir, 'ascend_hub'), ['Use node --test']);
    assert.equal((await call('GET', '/memory?key=..%2Fx')).status, 400);
  } finally {
    await room.close();
  }
});
