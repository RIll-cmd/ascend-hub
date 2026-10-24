import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { defaultSettings, mergeSettings } from '../../scripts/agent-room/agents.mjs';
import { errorText, RATE_LIMITED, shellCommands } from '../../scripts/agent-room/events.mjs';
import { dangerousCommand } from '../../scripts/agent-room/guard.mjs';
import { attentionNotifier, cleanNotify, ntfyMessage } from '../../scripts/agent-room/notify.mjs';
import { retryTime } from '../../scripts/agent-room/quota.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };
const PLAN = { tasks: [{ title: 'One', assignee: 'claude', description: 'a' }] };

function session(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const s = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) }, { project: 'app', task: 't', roles: ROLES });
  return { s, calls };
}

// Plans, then hands the first build turn to build(); review and finish always pass.
const flow = build => ({ stage, ...call }) => {
  if (stage === 'plan') return { text: json(PLAN) };
  if (stage === 'build') return build(call);
  if (stage === 'review') return { text: json({ verdict: 'ok' }) };
  if (stage === 'finish') return { text: 'Done.' };
  throw new Error(stage);
};

test('settings timeouts outside 1 s to 4 h, unknown names and non-objects keep the defaults with a warning', () => {
  const warnings = [];
  const warn = w => warnings.push(w);
  const base = defaultSettings({});
  assert.deepEqual(mergeSettings(base, { timeouts: { build: 60_000 } }, warn).timeouts, { ...base.timeouts, build: 60_000 });
  assert.equal(warnings.length, 0);
  const bad = mergeSettings(base, { timeouts: { build: 5, chat: '600000', check: 1.5, debate: 99_999_999, nap: 2000 } }, warn).timeouts;
  assert.deepEqual(bad, base.timeouts);
  assert.equal(warnings.length, 5);
  assert.deepEqual(mergeSettings(base, { timeouts: 'fast' }, warn).timeouts, base.timeouts);
  assert.match(warnings.at(-1), /must be an object/);
});

test('notify accepts only a plain http(s) ntfy topic URL', () => {
  const warnings = [];
  const warn = w => warnings.push(w);
  assert.equal(cleanNotify(undefined, warn), null);
  assert.equal(warnings.length, 0);
  assert.deepEqual(cleanNotify({ ntfy: 'https://ntfy.sh/room-x7f' }, warn), { ntfy: 'https://ntfy.sh/room-x7f' });
  for (const bad of [{ ntfy: 'ftp://ntfy.sh/t' }, { ntfy: 'https://u:p@ntfy.sh/t' }, { ntfy: 'https://ntfy.sh/' }, { ntfy: 'https://ntfy.sh/t?x=1' }, { ntfy: 3 }, 'https://ntfy.sh/t']) {
    assert.equal(cleanNotify(bad, warn), null, JSON.stringify(bad));
  }
  assert.equal(warnings.length, 6);
  assert.equal(mergeSettings(defaultSettings({}), { notify: { ntfy: 'nope' } }, () => {}).notify, null);
});

test('the notifier posts the summary with an ASCII title and only logs a failure', async () => {
  const posts = [];
  const warnings = [];
  const ok = attentionNotifier({ ntfy: 'https://ntfy.sh/t' }, async (url, init) => { posts.push({ url, ...init }); return { ok: true }; }, w => warnings.push(w));
  ok({ kind: 'gate', gate: 'plan', summary: 'The plan has 1 task.' }, { project: 'app' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(posts[0].url, 'https://ntfy.sh/t');
  assert.equal(posts[0].method, 'POST');
  assert.equal(posts[0].body, 'app: The plan has 1 task.');
  assert.equal(posts[0].headers.Title, 'Agent Room: plan gate');
  const broken = attentionNotifier({ ntfy: 'https://ntfy.sh/t' }, async () => { throw new Error('offline'); }, w => warnings.push(w));
  broken({ kind: 'pause', summary: 'x' }, {});
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(warnings, ['ntfy push failed: offline']);
  assert.equal(ntfyMessage({ kind: 'pause', summary: 'x' }, {}).title, 'Agent Room paused');
  assert.equal(attentionNotifier(null), null);
});

test('a session notifies once per gate visit, again after a revise, and not on later saves', async () => {
  const { s } = session(flow(() => { throw new Error('no build'); }));
  const seen = [];
  s.onAttention = a => seen.push(a.gate ?? a.kind);
  await s.kick();
  assert.deepEqual(seen, ['plan']);
  s.save();
  s.save();
  assert.deepEqual(seen, ['plan']);
  await s.gate({ gate: 'plan', decision: 'revise', note: 'smaller' });
  assert.deepEqual(seen, ['plan', 'plan']);
});

test('dangerous commands: pushes, hard resets and deletes outside the session folder', () => {
  const cwd = join('D:\\', 'ascend-builds', 'app');
  for (const bad of [
    'git push --force origin main', 'git push', 'bash -lc "git reset --hard HEAD~3"', 'git clean -fdx', 'git branch -D main', 'npm publish',
    'rm -rf /', 'rm -rf ..', 'rm -fr ~/code', 'rm -r -f "$HOME"', 'rm -rf .', 'rm -rf .git',
    'powershell.exe -Command "Remove-Item -Recurse -Force C:\\Users"', 'rd /s /q D:\\ascend_hub', 'cd x; rm -Rf ../other',
  ]) assert.ok(dangerousCommand(bad, cwd), bad);
  for (const fine of [
    'git status', 'git diff HEAD~1', 'git log --oneline', 'npm test', 'rm -rf node_modules dist', 'rm -rf ./build/*', 'rm notes.txt',
    'Remove-Item -Force old.txt', 'powershell.exe -Command "Remove-Item -Recurse -Force .\\tmp"', 'node -e "console.log(1)"',
  ]) assert.equal(dangerousCommand(fine, cwd), null, fine);
});

test('shell commands and CLI errors are read from the stream, not from what the agent writes', () => {
  assert.deepEqual(shellCommands('claude', { type: 'assistant', message: { content: [{ type: 'text', text: 'git push' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }, { type: 'tool_use', name: 'Read', input: { file_path: 'a' } }] } }), ['npm test']);
  assert.deepEqual(shellCommands('codex', { type: 'item.started', item: { type: 'command_execution', command: 'ls' } }), ['ls']);
  assert.deepEqual(shellCommands('agy', { event: 'step_update', step_update: { step_type: 'tool', tool_info: { parameters: { CommandLine: 'dir', Cwd: 'x' } } } }), ['dir']);
  assert.deepEqual(shellCommands('codex', { type: 'item.completed', item: { type: 'agent_message', text: 'git push' } }), []);
  assert.equal(errorText('claude', { type: 'result', is_error: true, result: 'Claude AI usage limit reached|1792000000' }), 'Claude AI usage limit reached|1792000000');
  assert.equal(errorText('claude', { type: 'result', is_error: false, result: 'rate limit notes' }), null);
  assert.equal(errorText('codex', { type: 'error', message: 'exceeded retry limit, last status: 429 Too Many Requests' }), 'exceeded retry limit, last status: 429 Too Many Requests');
  assert.equal(errorText('codex', { type: 'item.completed', item: { type: 'agent_message', text: 'usage limit' } }), null);
  assert.ok(RATE_LIMITED.test("You've hit your usage limit. Try again at 3:05 PM."));
  assert.ok(!RATE_LIMITED.test('Command failed: npm test exited with code 1'));
});

test('retry time: the reset in the error, else a full window, else ten minutes; never in the past', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  assert.equal(retryTime('limit reached|1792929600', null, now), new Date(1792929600_000 + 60_000).toISOString());
  const quota = { fiveHour: { usedPercent: 100, resetsAt: '2026-10-24T12:00:00Z' }, weekly: { usedPercent: 40, resetsAt: '2026-10-28T00:00:00Z' } };
  assert.equal(retryTime('429', quota, now), '2026-10-24T12:01:00.000Z');
  assert.equal(retryTime('429', null, now), '2026-10-24T10:10:00.000Z');
  assert.equal(retryTime('limit reached|1000000000', null, now), '2026-10-24T10:10:00.000Z');
  // Both windows full: wait for the later one.
  const both = { fiveHour: { usedPercent: 100, resetsAt: '2026-10-24T12:00:00Z' }, weekly: { usedPercent: 100, resetsAt: '2026-10-27T08:00:00Z' } };
  assert.equal(retryTime('429', both, now), '2026-10-27T08:01:00.000Z');
});

test("Claude's real limit message is detected and its local reset time read", () => {
  // Wording copied from Claude Code's own logs on this machine.
  for (const text of ["You've hit your session limit · resets 11:40pm (Asia/Shanghai)", "You've hit your weekly limit · resets 4pm (Asia/Shanghai)"]) {
    assert.ok(RATE_LIMITED.test(text), text);
  }
  const now = new Date(2026, 9, 24, 22, 0).getTime();
  assert.equal(retryTime("You've hit your session limit · resets 11:40pm (Asia/Shanghai)", null, now), new Date(2026, 9, 24, 23, 41).toISOString());
  assert.equal(retryTime("You've hit your weekly limit · resets 4pm (Asia/Shanghai)", null, now), new Date(2026, 9, 25, 16, 1).toISOString());
  assert.equal(retryTime('resets 12am', null, now), new Date(2026, 9, 25, 0, 1).toISOString());
});

test('a blocked command kills the turn and pauses the session for the owner', async () => {
  const { s, calls } = session(flow(({ emit, signal }) => {
    emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git push --force origin main' } }] } });
    return { aborted: signal.aborted, text: 'pushed' };
  }));
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(s.state.pause?.kind, 'guard');
  assert.match(s.state.pause.reason, /Claude tried a command the room does not allow \(it pushes to a remote\)/);
  assert.ok(s.transcript.some(m => m.from === 'room' && m.text.includes('Stopped Claude\'s turn: it ran `git push --force origin main`')));
  assert.equal(calls.filter(c => c.stage === 'build').length, 1);
  assert.notEqual(s.state.stage, 'stopped');
});

test('a rate-limited turn is not counted, is not retried at once, and resumes by itself', async () => {
  let builds = 0;
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const { s } = session(flow(({ emit }) => {
    builds += 1;
    if (builds === 1) {
      emit({ type: 'result', is_error: true, result: `Claude AI usage limit reached|${reset}` });
      return { ok: false, text: '' };
    }
    return { text: 'done', files: { 'a.txt': 'x' } };
  }));
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  const turnsBefore = s.state.turns;
  assert.equal(s.state.pause?.kind, 'rate-limit');
  assert.equal(s.state.pause.retryAt, new Date(reset * 1000 + 60_000).toISOString());
  assert.match(s.state.pause.reason, /Claude hit a rate limit\. The room retries by itself at/);
  assert.equal(builds, 1);
  assert.equal(s.state.turns, turnsBefore);
  assert.ok(s.retryTimer);
  // Pretend the window reset now.
  s.state.pause.retryAt = new Date(Date.now() - 1000).toISOString();
  s.scheduleRetry();
  await new Promise(r => setTimeout(r, 20));
  await s.loop;
  assert.equal(builds, 2);
  assert.equal(s.state.stage, 'gate-result');
  assert.equal(s.state.rateRetries, 0);
  assert.ok(s.transcript.some(m => m.text === 'Retrying after the rate limit.'));
});

test('a restored rate-limit pause schedules its retry again', async () => {
  const { s } = session(flow(() => ({ text: 'done' })));
  await s.kick();
  s.pauseWith('Claude hit a rate limit.', { kind: 'rate-limit', agent: 'claude', retryAt: new Date(Date.now() + 3600_000).toISOString() });
  const restored = RoomSession.load({ settings: s.settings, runTurn: s.runTurn }, s.dir);
  assert.ok(restored.retryTimer);
  await restored.stop();
  assert.equal(restored.state.stage, 'stopped');
});

test('after six automatic retries in a row the room waits for the owner', async () => {
  const { s } = session(flow(({ emit }) => {
    emit({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } });
    return { ok: false, text: '' };
  }));
  await s.kick();
  s.state.rateRetries = 6;
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(s.state.pause?.kind, 'rate-limit');
  assert.equal(s.state.pause.retryAt, null);
  assert.match(s.state.pause.reason, /still rate-limited after 6 automatic retries/);
  await s.stop();
});
