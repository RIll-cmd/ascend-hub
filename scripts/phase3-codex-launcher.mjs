import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildCodexProbeArguments(hooks) {
  const args = ['--no-alt-screen', '--sandbox', 'read-only', '--ask-for-approval',
    'on-request', '--enable', 'hooks', '--disable', 'plugins'];
  const allowed = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse',
    'PostToolUse', 'Stop', 'Interrupt', 'SessionEnd']);
  for (const [event, definitions] of Object.entries(hooks)) {
    const command = definitions?.[0]?.hooks?.[0]?.command;
    if (!allowed.has(event) || typeof command !== 'string' || /['\r\n]/.test(command)) {
      throw new Error('Invalid temporary probe hook definition');
    }
    args.push('-c', `hooks.${event}=[{hooks = [{type = 'command', command = '${command}', commandWindows = '${command}', timeout = 3}]}]`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [executable, hookFile, mode] = process.argv.slice(2);
  if (!executable || !hookFile || (mode && mode !== '--check')) {
    console.error('Usage: node phase3-codex-launcher.mjs <codex.exe> <probe-hooks.json> [--check]');
    process.exitCode = 1;
  } else {
    try {
      const args = buildCodexProbeArguments(JSON.parse(readFileSync(hookFile, 'utf8')).hooks);
      if (mode === '--check') args.push('--help');
      const result = spawnSync(executable, args, { shell: false, stdio: 'inherit' });
      if (result.error) console.error('Could not start the local Codex probe executable.');
      process.exitCode = result.status ?? 1;
    } catch {
      console.error('Could not load the temporary probe hook configuration.');
      process.exitCode = 1;
    }
  }
}
