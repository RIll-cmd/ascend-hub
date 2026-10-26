import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonLine, streamResultText } from './events.mjs';
import { claudeMcp, cleanConnectors, codexMcp } from './connectors.mjs';
import { cleanNotify } from './notify.mjs';
import { roomError } from './paths.mjs';

export const CLAUDE_ALLOWED_TOOLS = ['Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)'];

export function defaultSettings(env = process.env) {
  const npmModules = join(env.APPDATA ?? '', 'npm', 'node_modules');
  return {
    buildsRoot: env.ASCEND_BUILDS_ROOT ?? 'D:\\ascend-builds',
    maxDiscussTurns: 6,
    debateFolders: ['D:\\ascend_hub', 'D:\\ascend-core', 'D:\\ascend-vision'],
    // Codex keeps its rate-limit windows in its session logs; only that field is ever read.
    codexHome: env.CODEX_HOME ?? join(env.USERPROFILE ?? env.HOME ?? '', '.codex'),
    // Default checks for repo sessions; the owner can change the command when starting a session.
    checks: {
      'D:\\ascend_hub': 'npx --no-install tsc --noEmit && npx --no-install tsx --test tests/agent-room/*.test.ts && node --no-warnings --test tests/agent-room/*.test.mjs tests/hub/*.test.mjs',
      'D:\\ascend-vision': 'cd ascend-vision && "D:\\ascend-vision\\ascend-vision\\.venv\\Scripts\\python.exe" -m pytest -q -p no:cacheprovider',
      'D:\\ascend-core': 'npm test',
    },
    timeouts: { chat: 180_000, build: 900_000, debate: 600_000, check: 900_000 },
    agents: {
      codex: { command: process.execPath, prefixArgs: [join(npmModules, '@openai', 'codex', 'bin', 'codex.js')], model: 'gpt-6-astra' },
      claude: { command: join(npmModules, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), prefixArgs: [] },
      agy: { command: join(env.LOCALAPPDATA ?? '', 'agy', 'bin', 'agy.exe'), prefixArgs: [] },
    },
  };
}

// A turn or check gets 1 second to 4 hours; anything else in settings.json keeps the default.
const TIMEOUT_RANGE = [1_000, 14_400_000];

function cleanTimeouts(base, value, warn) {
  if (value === undefined) return { ...base };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    warn('settings.json: "timeouts" must be an object of milliseconds; using the defaults.');
    return { ...base };
  }
  const timeouts = { ...base };
  const [min, max] = TIMEOUT_RANGE;
  for (const [name, ms] of Object.entries(value)) {
    if (!(name in base)) warn(`settings.json: unknown timeout "${name}" ignored.`);
    else if (!Number.isInteger(ms) || ms < min || ms > max) warn(`settings.json: timeout "${name}" must be a whole number of milliseconds from ${min} to ${max}; using ${base[name]}.`);
    else timeouts[name] = ms;
  }
  return timeouts;
}

export function mergeSettings(base, override = {}, warn = console.warn) {
  return {
    ...base,
    ...override,
    timeouts: cleanTimeouts(base.timeouts, override.timeouts, warn),
    notify: cleanNotify(override.notify, warn),
    connectors: cleanConnectors(override.connectors, warn),
    agents: Object.fromEntries(Object.entries(base.agents).map(([id, agent]) => [id, { ...agent, ...override.agents?.[id] }])),
  };
}

// connectors: the session's MCP servers (see connectors.mjs); Antigravity cannot take them per turn.
// addDirs: other folders a read turn may look at (a session's other repo worktrees).
export function buildInvocation(agentId, mode, prompt, { cwd, settings, outFile, subagents = true, connectors = [], addDirs = [] }) {
  const agent = settings.agents[agentId];
  if (!agent) throw roomError('AGENT_UNKNOWN', String(agentId));
  if (mode !== 'read' && mode !== 'edit') throw roomError('MODE_INVALID', String(mode));
  const edit = mode === 'edit';
  if (agentId === 'codex') {
    // Codex has no working switch for sub-agents (--disable multi_agent still spawned them in the spike).
    return {
      command: agent.command,
      args: [...agent.prefixArgs, 'exec', '-m', agent.model, '--sandbox', edit ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '--json', '-C', cwd, '-o', outFile,
        ...codexMcp(connectors, settings.envFile), '-'],
      stdin: prompt,
      outFile,
      stream: 'codex',
    };
  }
  if (agentId === 'claude') {
    const mcp = claudeMcp(connectors, settings.envFile);
    const allowed = [...(edit ? CLAUDE_ALLOWED_TOOLS : []), ...mcp.allowed];
    // Plan mode refuses every MCP tool, so a read turn with connectors runs in default mode: headless, that still
    // refuses edits and commands, and the session's servers are allowed by name.
    const permission = edit ? 'acceptEdits' : mcp.allowed.length ? 'default' : 'plan';
    return {
      command: agent.command,
      args: [...agent.prefixArgs, '-p', ...(agent.model ? ['--model', agent.model] : []), '--output-format', 'stream-json', '--verbose', '--permission-mode', permission,
        '--disallowedTools', 'PowerShell', ...(subagents ? [] : ['Agent']), ...(allowed.length ? ['--allowedTools', ...allowed] : []), ...mcp.args,
        ...addDirs.flatMap(d => ['--add-dir', d])],
      stdin: prompt,
      outFile: null,
      stream: 'claude',
    };
  }
  // agy does not read the prompt from stdin; it must be attached to --print. Its stream-json carries tool calls and the reply.
  return { command: agent.command, args: [...agent.prefixArgs, '--mode', edit ? 'accept-edits' : 'plan', '--output-format', 'stream-json', ...addDirs.map(d => `--add-dir=${d}`), `--print=${prompt}`], stdin: null, outFile: null, stream: 'agy' };
}

export function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGKILL');
}

export function runTurn(invocation, { cwd, timeoutMs, signal, onEvent } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    if (invocation.outFile) rmSync(invocation.outFile, { force: true });
    let stdout = '';
    let stderr = '';
    let partial = '';
    let resultText = null;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const child = spawn(invocation.command, invocation.args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    // Stream lines are parsed as they arrive, so the result event survives the stdout cap.
    const readLine = text => {
      const event = parseJsonLine(text);
      if (!event) return;
      resultText = streamResultText(invocation.stream, event) ?? resultText;
      onEvent?.(event);
    };
    child.stdout.on('data', chunk => {
      if (stdout.length < 200_000) stdout += chunk;
      if (!invocation.stream) return;
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      lines.forEach(readLine);
    });
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
      if (invocation.stream && partial) readLine(partial);
      let text = invocation.stream === 'claude' || invocation.stream === 'agy' ? resultText ?? '' : stdout;
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
