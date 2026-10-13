import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { roomError } from './paths.mjs';

export const CLAUDE_ALLOWED_TOOLS = ['Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)'];

export function defaultSettings(env = process.env) {
  const npmModules = join(env.APPDATA ?? '', 'npm', 'node_modules');
  return {
    buildsRoot: env.ASCEND_BUILDS_ROOT ?? 'D:\\ascend-builds',
    maxDiscussTurns: 6,
    timeouts: { chat: 180_000, build: 900_000 },
    agents: {
      codex: { command: process.execPath, prefixArgs: [join(npmModules, '@openai', 'codex', 'bin', 'codex.js')], model: 'gpt-6-astra' },
      claude: { command: join(npmModules, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), prefixArgs: [] },
      agy: { command: join(env.LOCALAPPDATA ?? '', 'agy', 'bin', 'agy.exe'), prefixArgs: [] },
    },
  };
}

export function mergeSettings(base, override = {}) {
  return {
    ...base,
    ...override,
    timeouts: { ...base.timeouts, ...override.timeouts },
    agents: Object.fromEntries(Object.entries(base.agents).map(([id, agent]) => [id, { ...agent, ...override.agents?.[id] }])),
  };
}

export function buildInvocation(agentId, mode, prompt, { cwd, settings, outFile }) {
  const agent = settings.agents[agentId];
  if (!agent) throw roomError('AGENT_UNKNOWN', String(agentId));
  if (mode !== 'read' && mode !== 'edit') throw roomError('MODE_INVALID', String(mode));
  const edit = mode === 'edit';
  if (agentId === 'codex') {
    return {
      command: agent.command,
      args: [...agent.prefixArgs, 'exec', '-m', agent.model, '--sandbox', edit ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '-C', cwd, '-o', outFile, '-'],
      stdin: prompt,
      outFile,
    };
  }
  if (agentId === 'claude') {
    return {
      command: agent.command,
      args: [...agent.prefixArgs, '-p', '--permission-mode', edit ? 'acceptEdits' : 'plan', '--disallowedTools', 'PowerShell', ...(edit ? ['--allowedTools', ...CLAUDE_ALLOWED_TOOLS] : [])],
      stdin: prompt,
      outFile: null,
    };
  }
  // agy does not read the prompt from stdin; it must be attached to --print.
  return { command: agent.command, args: [...agent.prefixArgs, '--mode', edit ? 'accept-edits' : 'plan', `--print=${prompt}`], stdin: null, outFile: null };
}

export function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGKILL');
}

export function runTurn(invocation, { cwd, timeoutMs, signal } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    if (invocation.outFile) rmSync(invocation.outFile, { force: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const child = spawn(invocation.command, invocation.args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (stdout.length < 200_000) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 20_000) stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    const onAbort = () => { aborted = true; killTree(child); };
    if (signal?.aborted) onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      let text = stdout;
      if (invocation.outFile && existsSync(invocation.outFile)) text = readFileSync(invocation.outFile, 'utf8');
      text = text.trim();
      resolve({
        ok: !error && code === 0 && !timedOut && !aborted && text !== '',
        text, stderr: stderr.slice(-2000), error: error?.message ?? null, code, timedOut, aborted, durationMs: Date.now() - started,
      });
    };
    child.on('error', error => finish(null, error));
    child.on('close', code => finish(code, null));
    // 'close' waits for every holder of the pipes; a server the agent left running would hold them forever.
    child.on('exit', code => {
      setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(code, null);
      }, 1000).unref();
    });
    child.stdin.on('error', () => {});
    child.stdin.end(invocation.stdin ?? '');
  });
}
