import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function testSettings(buildsRoot) {
  return {
    buildsRoot, maxDiscussTurns: 6, timeouts: { chat: 1000, build: 1000 },
    agents: {
      codex: { command: 'fake-codex', prefixArgs: [], model: 'm' },
      claude: { command: 'fake-claude', prefixArgs: [] },
      agy: { command: 'fake-agy', prefixArgs: [] },
    },
  };
}

export function tempRoom() {
  const base = mkdtempSync(join(tmpdir(), 'ascend-room-session-'));
  return { dataDir: join(base, 'data'), buildsRoot: join(base, 'builds') };
}

export const stageOf = prompt => /^Room stage: (\w+)/.exec(prompt)[1];

// respond({ agent, mode, stage, prompt, cwd, signal }) -> { text, files?, ok?, aborted? } (may be async)
export function fakeRunTurn(respond, calls = []) {
  return async (invocation, { cwd, signal }) => {
    const agent = invocation.command.replace('fake-', '');
    const mode = invocation.args.some(a => ['workspace-write', 'acceptEdits', 'accept-edits'].includes(a)) ? 'edit' : 'read';
    const prompt = invocation.stdin ?? invocation.args.find(a => a.startsWith('--print=')).slice('--print='.length);
    const call = { agent, mode, stage: stageOf(prompt), prompt };
    calls.push(call);
    const reply = await respond({ ...call, cwd, signal });
    for (const [file, content] of Object.entries(reply.files ?? {})) writeFileSync(join(cwd, file), content);
    const ok = reply.ok ?? !reply.aborted;
    return { ok, text: reply.text ?? '', stderr: '', error: null, code: ok ? 0 : 1, timedOut: false, aborted: Boolean(reply.aborted), durationMs: 1 };
  };
}

export const json = value => `Here you go:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
