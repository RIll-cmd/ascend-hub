import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import test from 'node:test';
import { capturePreview, findBrowser, validatePreview } from '../../scripts/agent-room/preview.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { writeRoleSets } from '../../scripts/agent-room/skills.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const freePort = () => new Promise(resolve => {
  const server = createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

// Stands in for headless Edge: saves the page it was pointed at as the "screenshot".
function fakeBrowser(dir) {
  const file = join(dir, 'fake-browser.mjs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `import { writeFileSync } from 'node:fs';
const shot = process.argv.find(a => a.startsWith('--screenshot=')).slice('--screenshot='.length);
const page = await fetch(process.argv.at(-1)).then(r => r.text());
writeFileSync(shot, page);
`, 'utf8');
  return { command: process.execPath, prefixArgs: [file] };
}

const serve = port => `node -e "require('http').createServer((q, s) => s.end('<h1>hi</h1>')).listen(${port}, '127.0.0.1')"`;

test('the preview must be a command and a loopback http URL', () => {
  assert.equal(validatePreview(undefined), null);
  assert.equal(validatePreview(null), null);
  assert.deepEqual(validatePreview({ command: ' npm run dev ', url: 'http://localhost:3000/' }), { command: 'npm run dev', url: 'http://localhost:3000/' });
  assert.ok(validatePreview({ command: 'x', url: 'http://127.0.0.1:5173' }));
  for (const bad of [{ command: 'x', url: 'https://example.com' }, { command: 'x', url: 'file:///C:/a.html' }, { command: '', url: 'http://localhost:1' }, { command: 'x', url: 'nope' }, 'x']) {
    assert.throws(() => validatePreview(bad), /PREVIEW_INVALID/, JSON.stringify(bad));
  }
});

test('a browser setting wins; otherwise an installed Edge or Chrome is used', () => {
  assert.deepEqual(findBrowser({ browser: { command: 'b.exe', prefixArgs: [] } }), { command: 'b.exe', prefixArgs: [] });
  const found = findBrowser({}, ['Z:\\missing.exe', process.execPath]);
  assert.equal(found.command, process.execPath);
  assert.equal(findBrowser({}, ['Z:\\missing.exe']), null);
});

test('capture starts the app, waits for the URL, saves the screenshot and stops the app', async () => {
  const { dataDir } = tempRoom();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const outFile = join(dataDir, 'shot.png');
  const result = await capturePreview({ dir: dataDir, command: serve(port), url, outFile, browser: fakeBrowser(dataDir) });
  assert.deepEqual(result, { ok: true });
  assert.equal(readFileSync(outFile, 'utf8'), '<h1>hi</h1>');
  await assert.rejects(fetch(url), 'the app is stopped afterwards');
});

test('capture reports an app that never answers, and a missing browser', async () => {
  const { dataDir } = tempRoom();
  mkdirSync(dataDir, { recursive: true });
  const port = await freePort();
  const slow = await capturePreview({ dir: dataDir, command: 'node -e "setTimeout(() => {}, 60000)"', url: `http://127.0.0.1:${port}/`, outFile: join(dataDir, 'a.png'), browser: fakeBrowser(dataDir), timeoutMs: 1500 });
  assert.equal(slow.ok, false);
  assert.match(slow.error, /did not answer/);
  const none = await capturePreview({ dir: dataDir, command: serve(port), url: `http://127.0.0.1:${port}/`, outFile: join(dataDir, 'b.png'), browser: null });
  assert.match(none.error, /No Edge or Chrome/);
});

test('a design review gets a screenshot of the app in .ascend/preview, never committed', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  writeRoleSets(dataDir, { sets: { 'ui-ux': { on: true } } });
  const port = await freePort();
  const calls = [];
  const respond = ({ stage }) => ({
    plan: { text: json({ tasks: [{ title: 'Page', assignee: 'claude', description: 'd', role: 'ui-ux' }] }) },
    build: { text: 'ok', files: { 'index.html': '<h1>hi</h1>' } },
    review: { text: json({ verdict: 'ok' }) },
    finish: { text: '# Done' },
  })[stage];
  const settings = { ...testSettings(buildsRoot), browser: fakeBrowser(join(dataDir, 'bin')) };
  const session = RoomSession.create({ dataDir, settings, runTurn: fakeRunTurn(respond, calls) },
    { project: 'shot-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, preview: { command: serve(port), url: `http://127.0.0.1:${port}/` } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  const dir = session.state.projectDir;
  const review = calls.find(c => c.stage === 'review');
  assert.match(review.prompt, /\.ascend\/preview\/task-1\.png/);
  assert.ok(existsSync(join(dir, '.ascend', 'preview', 'task-1.png')));
  assert.ok(spawnSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).stdout.split('\n').every(f => !f.startsWith('.ascend')));
  assert.match(session.transcript.map(m => m.text).join('\n'), /Captured the app preview for task 1/);
});

test('a failed preview still runs the design review, from the diff alone', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  writeRoleSets(dataDir, { sets: { 'ui-ux': { on: true } } });
  const calls = [];
  const respond = ({ stage }) => ({
    plan: { text: json({ tasks: [{ title: 'Page', assignee: 'claude', description: 'd', role: 'ui-ux' }] }) },
    build: { text: 'ok', files: { 'index.html': 'x' } },
    review: { text: json({ verdict: 'ok' }) },
    finish: { text: '# Done' },
  })[stage];
  const session = RoomSession.create({ dataDir, settings: { ...testSettings(buildsRoot), browser: { command: 'Z:\\no-browser.exe', prefixArgs: [] }, previewTimeoutMs: 1500 }, runTurn: fakeRunTurn(respond, calls) },
    { project: 'noshot-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, preview: { command: 'node -e "setTimeout(() => {}, 60000)"', url: `http://127.0.0.1:${await freePort()}/` } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.match(calls.find(c => c.stage === 'review').prompt, /could not be captured/);
  assert.equal(session.state.plan.tasks[0].status, 'done');
});
