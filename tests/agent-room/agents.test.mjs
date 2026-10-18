import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CLAUDE_ALLOWED_TOOLS, buildInvocation, defaultSettings, mergeSettings, runTurn } from '../../scripts/agent-room/agents.mjs';

const fake = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
const cwd = mkdtempSync(join(tmpdir(), 'ascend-room-agents-'));
const outFile = join(cwd, 'last.txt');
const fakeSettings = mergeSettings(defaultSettings({ APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' }), {
  agents: {
    codex: { command: process.execPath, prefixArgs: [fake] },
    claude: { command: process.execPath, prefixArgs: [fake] },
    agy: { command: process.execPath, prefixArgs: [fake] },
  },
});

test('default settings point at the verified executables', () => {
  const s = defaultSettings({ APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' });
  assert.equal(s.agents.codex.command, process.execPath);
  assert.deepEqual(s.agents.codex.prefixArgs, [join('C:\\A', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')]);
  assert.equal(s.agents.codex.model, 'gpt-6-astra');
  assert.equal(s.agents.claude.command, join('C:\\A', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
  assert.equal(s.agents.agy.command, join('C:\\L', 'agy', 'bin', 'agy.exe'));
  assert.equal(s.buildsRoot, 'D:\\ascend-builds');
  assert.equal(defaultSettings({ ASCEND_BUILDS_ROOT: 'E:\\b' }).buildsRoot, 'E:\\b');
  assert.deepEqual(s.timeouts, { chat: 180000, build: 900000, debate: 600000, check: 900000 });
});

test('mergeSettings overrides per agent without dropping defaults', () => {
  const merged = mergeSettings(defaultSettings({}), { agents: { codex: { model: 'x' } }, timeouts: { build: 5 } });
  assert.equal(merged.agents.codex.model, 'x');
  assert.equal(merged.agents.codex.command, process.execPath);
  assert.deepEqual(merged.timeouts, { chat: 180000, build: 5, debate: 600000, check: 900000 });
});

test('role mode maps to each CLI permission flag', () => {
  const s = defaultSettings({ APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' });
  const opts = { cwd: 'D:\\b\\p', settings: s, outFile: 'D:\\o.txt' };
  assert.deepEqual(buildInvocation('codex', 'read', 'hi', opts).args.slice(1),
    ['exec', '-m', 'gpt-6-astra', '--sandbox', 'read-only', '--skip-git-repo-check', '--json', '-C', 'D:\\b\\p', '-o', 'D:\\o.txt', '-']);
  assert.ok(buildInvocation('codex', 'edit', 'hi', opts).args.includes('workspace-write'));
  assert.equal(buildInvocation('codex', 'read', 'hi', opts).stdin, 'hi');
  assert.equal(buildInvocation('codex', 'read', 'hi', opts).stream, 'codex');
  const stream = ['--output-format', 'stream-json', '--verbose'];
  assert.deepEqual(buildInvocation('claude', 'read', 'hi', opts).args, ['-p', ...stream, '--permission-mode', 'plan', '--disallowedTools', 'PowerShell']);
  assert.deepEqual(buildInvocation('claude', 'edit', 'hi', opts).args,
    ['-p', ...stream, '--permission-mode', 'acceptEdits', '--disallowedTools', 'PowerShell', '--allowedTools', ...CLAUDE_ALLOWED_TOOLS]);
  assert.equal(buildInvocation('claude', 'read', 'hi', opts).stream, 'claude');
  assert.deepEqual(buildInvocation('claude', 'edit', 'hi', { ...opts, subagents: false }).args,
    ['-p', ...stream, '--permission-mode', 'acceptEdits', '--disallowedTools', 'PowerShell', 'Agent', '--allowedTools', ...CLAUDE_ALLOWED_TOOLS]);
  assert.equal(buildInvocation('agy', 'read', 'hi', opts).stream, 'agy');
  assert.deepEqual(CLAUDE_ALLOWED_TOOLS, ['Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)']);
  const tricky = 'say "hi" --mode edit\nline2 & del *';
  assert.deepEqual(buildInvocation('agy', 'read', tricky, opts), { command: s.agents.agy.command, args: ['--mode', 'plan', '--output-format', 'stream-json', `--print=${tricky}`], stdin: null, outFile: null, stream: 'agy' });
  assert.equal(buildInvocation('agy', 'edit', 'x', opts).args[1], 'accept-edits');
  assert.throws(() => buildInvocation('gpt', 'read', 'x', opts), { code: 'AGENT_UNKNOWN' });
  assert.throws(() => buildInvocation('codex', 'write', 'x', opts), { code: 'MODE_INVALID' });
});

test('runTurn passes a tricky agy prompt as one argument, unchanged', async () => {
  const tricky = 'say "hi" --mode edit\nline2 & del * %PATH%';
  const res = await runTurn(buildInvocation('agy', 'read', tricky, { cwd, settings: fakeSettings, outFile }), { cwd, timeoutMs: 20_000 });
  assert.equal(res.ok, true);
  assert.ok(res.text.startsWith(`ECHO:${tricky}|`), res.text);
});

test('runTurn feeds stdin and reads the codex -o file instead of stdout noise', async () => {
  const res = await runTurn(buildInvocation('codex', 'read', 'hello codex', { cwd, settings: fakeSettings, outFile }), { cwd, timeoutMs: 20_000 });
  assert.equal(res.ok, true);
  assert.ok(res.text.startsWith('ECHO:hello codex|'));
  assert.doesNotMatch(res.text, /noise/);
});

test('runTurn reports failure, empty output, timeout and abort', async () => {
  const inv = prompt => buildInvocation('claude', 'read', prompt, { cwd, settings: fakeSettings, outFile });
  const failed = await runTurn(inv('FAIL'), { cwd, timeoutMs: 20_000 });
  assert.equal(failed.ok, false); assert.equal(failed.code, 3); assert.match(failed.stderr, /boom/);
  const empty = await runTurn(inv('EMPTY'), { cwd, timeoutMs: 20_000 });
  assert.equal(empty.ok, false); assert.equal(empty.code, 0); assert.equal(empty.text, '');
  const slow = await runTurn(inv('SLEEP'), { cwd, timeoutMs: 500 });
  assert.equal(slow.ok, false); assert.equal(slow.timedOut, true);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  const aborted = await runTurn(inv('SLEEP'), { cwd, timeoutMs: 20_000, signal: controller.signal });
  assert.equal(aborted.ok, false); assert.equal(aborted.aborted, true);
  const missing = await runTurn({ command: join(cwd, 'nope.exe'), args: [], stdin: null, outFile: null }, { cwd, timeoutMs: 5_000 });
  assert.equal(missing.ok, false); assert.match(missing.error, /ENOENT/);
});

test('runTurn finishes soon after the CLI exits even if a grandchild keeps its stdout open', async () => {
  const started = Date.now();
  const res = await runTurn(buildInvocation('claude', 'read', 'LINGER please', { cwd, settings: fakeSettings, outFile }), { cwd, timeoutMs: 20_000 });
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);
  assert.equal(res.ok, true);
  assert.equal(res.timedOut, false);
  assert.match(res.text, /LINGER please/);
});

test('debate defaults: the three Ascend repos and a longer read-only turn limit', () => {
  const s = defaultSettings({});
  assert.deepEqual(s.debateFolders, ['D:\\ascend_hub', 'D:\\ascend-core', 'D:\\ascend-vision']);
  assert.ok(s.debateFolders.every(f => f.startsWith('D:\\ascend')), 'backslashes survive');
  assert.equal(s.timeouts.debate, 600000);
});

test('runTurn streams sub-agent events and takes Claude\'s reply from the result event', async () => {
  const events = [];
  const res = await runTurn(buildInvocation('claude', 'read', 'SUBAGENT hello', { cwd, settings: fakeSettings, outFile }),
    { cwd, timeoutMs: 20_000, onEvent: e => events.push(e) });
  assert.equal(res.ok, true);
  assert.equal(res.text, 'final: SUBAGENT hello');
  assert.deepEqual(events.map(e => e.subtype ?? e.type), ['task_started', 'task_progress', 'task_updated', 'success']);
});

test('runTurn streams Codex events but still reads its reply from the -o file', async () => {
  const events = [];
  const res = await runTurn(buildInvocation('codex', 'read', 'SUBAGENT hi', { cwd, settings: fakeSettings, outFile }),
    { cwd, timeoutMs: 20_000, onEvent: e => events.push(e) });
  assert.ok(res.text.startsWith('ECHO:SUBAGENT hi|'), res.text);
  assert.deepEqual(events.map(e => `${e.type}:${e.item?.tool}`), ['item.started:wait', 'item.completed:wait']);
});
