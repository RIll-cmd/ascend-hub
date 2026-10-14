import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { claudeQuota, codexQuotaFromLog, latestCodexQuota, quotaWarning } from '../../scripts/agent-room/quota.mjs';

const CLAUDE_EVENT = {
  type: 'rate_limit_event',
  rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.03, resetsAt: 1791984600 }, seven_day: { utilization: 0.8, resetsAt: 1792310400 } } },
};
const codexLine = (five, week) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: {} },
  rate_limits: { primary: { used_percent: five, window_minutes: 300, resets_at: 1791986118 }, secondary: { used_percent: week, window_minutes: 10080, resets_at: 1792477137 } } } });

test('Claude quota comes from its rate-limit event, as percentages with reset times', () => {
  assert.deepEqual(claudeQuota(CLAUDE_EVENT), {
    fiveHour: { usedPercent: 3, resetsAt: '2026-10-14T13:30:00.000Z' },
    weekly: { usedPercent: 80, resetsAt: '2026-10-18T08:00:00.000Z' },
  });
  assert.equal(claudeQuota({ type: 'result' }), null);
});

test('Codex quota is the last rate_limits entry in its session log; conversation text is ignored', () => {
  const text = [codexLine(5, 20), JSON.stringify({ type: 'response_item', payload: { text: 'secret conversation' } }), codexLine(8, 26), ''].join('\n');
  const quota = codexQuotaFromLog(text);
  assert.equal(quota.fiveHour.usedPercent, 8);
  assert.equal(quota.weekly.usedPercent, 26);
  assert.equal(JSON.stringify(quota).includes('secret'), false);
  assert.equal(codexQuotaFromLog('not json\n'), null);
});

test('the newest Codex session log wins', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
  const dir = join(home, 'sessions', '2026', '10', '14');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rollout-old.jsonl'), codexLine(50, 60));
  writeFileSync(join(dir, 'rollout-new.jsonl'), codexLine(9, 27));
  utimesSync(join(dir, 'rollout-old.jsonl'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  assert.equal(latestCodexQuota(home).fiveHour.usedPercent, 9);
  assert.equal(latestCodexQuota(join(home, 'missing')), null);
});

test('a warning names the agent and window when either is nearly used up', () => {
  const quota = { claude: { fiveHour: { usedPercent: 92, resetsAt: '2026-10-14T13:30:00.000Z' }, weekly: { usedPercent: 40, resetsAt: null } }, codex: null };
  assert.match(quotaWarning(quota), /^Claude has used 92% of its 5-hour window/);
  assert.equal(quotaWarning({ claude: { fiveHour: { usedPercent: 10 }, weekly: { usedPercent: 89 } } }), null);
});

test('status reports each agent quota: Codex from its log, Claude from its last rate-limit event', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const { fakeRunTurn, json, tempRoom, testSettings } = await import('./helpers.mjs');
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
  mkdirSync(join(home, 'sessions', '2026', '10', '14'), { recursive: true });
  writeFileSync(join(home, 'sessions', '2026', '10', '14', 'rollout-a.jsonl'), codexLine(12, 30));
  const { dataDir, buildsRoot } = tempRoom();
  const settings = { ...testSettings(buildsRoot), codexHome: home };
  const runTurn = fakeRunTurn(({ stage, emit }) => {
    emit(CLAUDE_EVENT);
    return { text: stage === 'plan' ? json({ tasks: [{ title: 'x', assignee: 'claude', description: '' }] }) : 'ok' };
  });
  const room = await startRoomServer({ dataDir, settings, runTurn, probe: async () => ({ state: 'ready' }), port: 0 });
  try {
    const call = (method, path, body) => fetch(`http://127.0.0.1:${room.port}${path}`, { method, headers: { authorization: `Bearer ${room.token}` }, body: body && JSON.stringify(body) });
    await new Promise(r => setTimeout(r, 20));
    let status = await (await call('GET', '/status')).json();
    assert.equal(status.quota.codex.fiveHour.usedPercent, 12);
    assert.equal(status.quota.claude, null);
    await call('POST', '/sessions', { project: 'q', task: 't', roles: { orchestrator: 'claude', coders: ['claude'], reviewer: null } });
    for (let i = 0; i < 50 && !status.quota.claude; i++) {
      await new Promise(r => setTimeout(r, 50));
      status = await (await call('GET', '/status')).json();
    }
    assert.equal(status.quota.claude.weekly.usedPercent, 80);
  } finally {
    await room.close();
  }
});

test('a newest log without rate limits yet (a turn still running) falls back to the previous one', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
  const dir = join(home, 'sessions', '2026', '10', '14');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rollout-done.jsonl'), codexLine(11, 31));
  writeFileSync(join(dir, 'rollout-running.jsonl'), JSON.stringify({ type: 'session_meta', payload: {} }));
  utimesSync(join(dir, 'rollout-done.jsonl'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  assert.equal(latestCodexQuota(home).fiveHour.usedPercent, 11);
});

test('the readiness probe passes its events on, so Claude quota is known before any session', async () => {
  const { probeAgent } = await import('../../scripts/agent-room/server.mjs');
  const { testSettings } = await import('./helpers.mjs');
  const seen = [];
  const runTurn = async (_invocation, { onEvent }) => {
    onEvent?.(CLAUDE_EVENT);
    return { ok: true, text: 'READY', stderr: '', error: null, code: 0, timedOut: false, aborted: false, durationMs: 1 };
  };
  const result = await probeAgent('claude', testSettings(tmpdir()), runTurn, event => seen.push(event.type));
  assert.equal(result.state, 'ready');
  assert.deepEqual(seen, ['rate_limit_event']);
});

test('Refresh re-reads the Codex log for free and probes Claude at most once a minute', async () => {
  const { startRoomServer } = await import('../../scripts/agent-room/server.mjs');
  const { tempRoom, testSettings } = await import('./helpers.mjs');
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
  const day = join(home, 'sessions', '2026', '10', '14');
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, 'rollout-a.jsonl'), codexLine(12, 30));
  utimesSync(join(day, 'rollout-a.jsonl'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  const { dataDir, buildsRoot } = tempRoom();
  const probes = [];
  const runTurn = async (invocation, { onEvent }) => {
    const agent = invocation.command.replace('fake-', '');
    probes.push(agent);
    if (agent === 'claude') onEvent?.(CLAUDE_EVENT);
    return { ok: true, text: 'READY', stderr: '', error: null, code: 0, timedOut: false, aborted: false, durationMs: 1 };
  };
  const room = await startRoomServer({ dataDir, settings: { ...testSettings(buildsRoot), codexHome: home }, runTurn, port: 0 });
  try {
    const call = (method, path) => fetch(`http://127.0.0.1:${room.port}${path}`, { method, headers: { authorization: `Bearer ${room.token}` } });
    await new Promise(r => setTimeout(r, 20));
    const startup = probes.filter(a => a === 'claude').length;
    assert.equal((await (await call('GET', '/quota')).json()).quota.codex.fiveHour.usedPercent, 12);
    assert.equal(probes.filter(a => a === 'claude').length, startup, 'reading the meter never runs a turn');

    writeFileSync(join(day, 'rollout-b.jsonl'), codexLine(44, 50));
    const first = await (await call('POST', '/quota/refresh')).json();
    assert.equal(first.quota.codex.fiveHour.usedPercent, 44);
    assert.equal(first.quota.claude.weekly.usedPercent, 80);
    assert.deepEqual(first.refreshed, { codex: true, claude: true });
    assert.equal(probes.filter(a => a === 'claude').length, startup + 1);
    assert.deepEqual(probes.filter(a => a !== 'claude').length, 2, 'only Claude is probed again');

    const second = await (await call('POST', '/quota/refresh')).json();
    assert.deepEqual(second.refreshed, { codex: true, claude: false });
    assert.equal(probes.filter(a => a === 'claude').length, startup + 1);
  } finally {
    await room.close();
  }
});
