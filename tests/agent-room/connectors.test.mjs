import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildInvocation, CLAUDE_ALLOWED_TOOLS, mergeSettings } from '../../scripts/agent-room/agents.mjs';
import { chooseConnectors, cleanConnectors, connectorList } from '../../scripts/agent-room/connectors.mjs';
import { readEnvFile, serverEnv, spawnArgs } from '../../scripts/agent-room/mcp-launch.mjs';
import { startRoomServer } from '../../scripts/agent-room/server.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const LAUNCHER = join(import.meta.dirname, '..', '..', 'scripts', 'agent-room', 'mcp-launch.mjs');
const ECHO = join(import.meta.dirname, 'fixtures', 'echo-mcp.mjs');
const echo = { echo: { name: 'Echo', description: 'Says the word.', command: process.execPath, args: [ECHO], env: ['ROOM_ECHO_WORD'] } };

function settingsWith(connectors, extra = {}) {
  return { ...testSettings('B:\\builds'), connectors: cleanConnectors(connectors, () => {}), envFile: 'C:\\hub\\.env.local', ...extra };
}

test('settings keep valid connectors and skip the rest with a warning', () => {
  const warnings = [];
  const clean = cleanConnectors({
    ...echo,
    'Bad Id': { command: 'x' },
    nocmd: { args: ['a'] },
    badenv: { command: 'x', env: ['NOT-A-NAME'] },
    bare: { command: 'npx.cmd' },
  }, w => warnings.push(w));
  assert.deepEqual(Object.keys(clean), ['echo', 'bare']);
  assert.deepEqual(clean.bare, { id: 'bare', name: 'bare', description: '', command: 'npx.cmd', args: [], env: [] });
  assert.equal(warnings.length, 3);
  assert.deepEqual(cleanConnectors(['x'], () => {}), {});
  assert.deepEqual(mergeSettings(testSettings('B:\\b'), {}, () => {}).connectors, {});
});

test('Claude gets the session servers through the launcher, allowed by name, and read turns leave plan mode for them', () => {
  const settings = settingsWith(echo);
  const connectors = [settings.connectors.echo];
  const read = buildInvocation('claude', 'read', 'p', { cwd: 'C:\\w', settings, connectors }).args;
  assert.equal(read[read.indexOf('--permission-mode') + 1], 'default');
  assert.deepEqual(read.slice(read.indexOf('--allowedTools') + 1, read.indexOf('--mcp-config')), ['mcp__echo']);
  const config = JSON.parse(read[read.indexOf('--mcp-config') + 1]);
  assert.deepEqual(config.mcpServers.echo, { command: process.execPath, args: [LAUNCHER, 'C:\\hub\\.env.local', 'ROOM_ECHO_WORD', '--', process.execPath, ECHO] });
  assert.ok(!read.join(' ').includes('pelican'), 'no secret values in the command line');
  const edit = buildInvocation('claude', 'edit', 'p', { cwd: 'C:\\w', settings, connectors }).args;
  assert.equal(edit[edit.indexOf('--permission-mode') + 1], 'acceptEdits');
  assert.deepEqual(edit.slice(edit.indexOf('--allowedTools') + 1, edit.indexOf('--mcp-config')), [...CLAUDE_ALLOWED_TOOLS, 'mcp__echo']);
  const plain = buildInvocation('claude', 'read', 'p', { cwd: 'C:\\w', settings }).args;
  assert.equal(plain[plain.indexOf('--permission-mode') + 1], 'plan', 'no connectors, no change');
  assert.ok(!plain.includes('--mcp-config') && !plain.includes('--allowedTools'));
});

test('Codex gets the servers as config overrides, approved, with the listed variables passed through', () => {
  const settings = settingsWith(echo);
  const args = buildInvocation('codex', 'read', 'p', { cwd: 'C:\\w', settings, outFile: 'o.txt', connectors: [settings.connectors.echo] }).args;
  const overrides = args.filter((a, i) => args[i - 1] === '-c');
  assert.deepEqual(overrides, [
    `mcp_servers.echo.command=${JSON.stringify(process.execPath)}`,
    `mcp_servers.echo.args=${JSON.stringify([LAUNCHER, 'C:\\hub\\.env.local', 'ROOM_ECHO_WORD', '--', process.execPath, ECHO])}`,
    'mcp_servers.echo.default_tools_approval_mode="approve"',
    'mcp_servers.echo.env_vars=["ROOM_ECHO_WORD"]',
  ]);
  assert.equal(args.at(-1), '-', 'the prompt still comes from stdin');
  const agy = buildInvocation('agy', 'read', 'p', { cwd: 'C:\\w', settings, connectors: [settings.connectors.echo] }).args;
  assert.ok(!agy.some(a => a.includes('echo')), 'Antigravity keeps its own MCP config');
});

test('the launcher passes only system variables and the listed ones, from the environment first, then the env file', () => {
  const env = { Path: 'C:\\bin', SystemRoot: 'C:\\Windows', ASCEND_ROOM_TOKEN: 'secret', A: 'from-env', OTHER: 'x' };
  assert.deepEqual(serverEnv(['A', 'B', 'C'], env, { A: 'from-file', B: 'from-file' }), { Path: 'C:\\bin', SystemRoot: 'C:\\Windows', A: 'from-env', B: 'from-file' });
  const { dataDir } = tempRoom();
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, '.env.local');
  writeFileSync(file, '# note\nPLAIN=one\nQUOTED="two words"\n  SPACED = three \nbad line\n', 'utf8');
  assert.deepEqual(readEnvFile(file), { PLAIN: 'one', QUOTED: 'two words', SPACED: 'three' });
  assert.deepEqual(readEnvFile(join(dataDir, 'none')), {});
  assert.deepEqual(spawnArgs('npx.cmd', ['-y', 'a b', 'say "hi"'], 'win32'), { command: 'npx.cmd -y "a b" "say ""hi"""', args: [], shell: true });
  assert.deepEqual(spawnArgs('node.exe', ['a b'], 'win32'), { command: 'node.exe', args: ['a b'], shell: false });
});

test('a server started through the launcher answers with the variable from the env file and nothing else leaks', () => {
  const { dataDir } = tempRoom();
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, '.env.local');
  writeFileSync(file, 'ROOM_ECHO_WORD=pelican\n', 'utf8');
  const input = ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo_word"}}'].join('\n');
  const run = spawnSync(process.execPath, [LAUNCHER, file, 'ROOM_ECHO_WORD', '--', process.execPath, ECHO], { input: `${input}\n`, encoding: 'utf8', env: { ...process.env, ROOM_LEAK_TEST: '1' }, timeout: 10_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /word=pelican leaked=no/);
});

test('a session keeps its connectors, every Claude and Codex turn gets them, and the prompt names them', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const settings = { ...testSettings(buildsRoot), connectors: cleanConnectors(echo, () => {}), envFile: join(dataDir, '.env.local') };
  assert.throws(() => chooseConnectors(['nope'], settings), /CONNECTORS_INVALID/);
  assert.deepEqual(chooseConnectors(['echo', 'echo'], settings), ['echo']);
  const calls = [];
  const respond = ({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] }) } : { text: 'ok [READY]' });
  const session = RoomSession.create({ dataDir, settings, runTurn: fakeRunTurn(respond, calls) },
    { project: 'mcp-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, connectors: ['echo'] });
  assert.deepEqual(session.state.connectors, ['echo']);
  await session.kick();
  assert.ok(calls.length > 0);
  for (const call of calls) {
    if (call.agent === 'claude') assert.ok(call.args.includes('--mcp-config'));
    if (call.agent === 'codex') assert.ok(call.args.includes('mcp_servers.echo.default_tools_approval_mode="approve"'));
    assert.match(call.prompt, /MCP CONNECTORS for this session .*Echo \(echo\): Says the word\./);
  }
  const plain = RoomSession.create({ dataDir, settings, runTurn: fakeRunTurn(respond) }, { project: 'plain-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  assert.equal(plain.state.connectors, undefined);
});

test('the room status lists connectors with the variables that still have no value', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  mkdirSync(dataDir, { recursive: true });
  const envFile = join(dataDir, '.env.local');
  writeFileSync(envFile, 'IN_FILE=1\n', 'utf8');
  const settings = { ...testSettings(buildsRoot), envFile, connectors: cleanConnectors({ gh: { name: 'GitHub', command: 'x', env: ['IN_FILE', 'ROOM_NEVER_SET_XYZ'] } }, () => {}) };
  assert.deepEqual(connectorList(settings), [{ id: 'gh', name: 'GitHub', description: '', missing: ['ROOM_NEVER_SET_XYZ'] }]);
  const room = await startRoomServer({ dataDir, settings, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const status = await (await fetch(`http://127.0.0.1:${room.port}/status`, { headers: { authorization: `Bearer ${room.token}` } })).json();
    assert.deepEqual(status.connectors, [{ id: 'gh', name: 'GitHub', description: '', missing: ['ROOM_NEVER_SET_XYZ'] }]);
  } finally {
    await room.close();
  }
});
