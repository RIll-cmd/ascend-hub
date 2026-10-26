// Starts one MCP server for an agent CLI with a minimal environment: the system variables a process needs to run, plus
// only the variables the connector lists, read from this environment or from Hub's .env.local. So a token reaches the
// server without being in a command line or config file, and the server never sees the rest of the room's environment.
// Usage: node mcp-launch.mjs <env-file> <NAME,NAME|-> -- <command> [args...]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE = ['PATH', 'PATHEXT', 'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'LANG', 'TERM'];

export function readEnvFile(file) {
  if (!file || !existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/)
    .map(line => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)).filter(Boolean)
    .map(([, name, value]) => [name, value.replace(/^(['"])(.*)\1$/, '$2')]));
}

export function serverEnv(names, env = process.env, file = {}) {
  const out = {};
  // Windows variable names are case-insensitive; keep the spelling this process has.
  for (const key of Object.keys(env)) if (BASE.some(b => b.toLowerCase() === key.toLowerCase())) out[key] = env[key];
  for (const name of names) {
    const value = env[name] ?? file[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

// A .cmd or .bat (npx, for example) needs cmd.exe on Windows; its arguments are quoted for it.
export function spawnArgs(command, args, platform = process.platform) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(command)) return { command, args, shell: false };
  const quote = a => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  return { command: [command, ...args].map(quote).join(' '), args: [], shell: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [envFile, list, sep, command, ...args] = process.argv.slice(2);
  if (sep !== '--' || !command) {
    console.error('usage: mcp-launch.mjs <env-file> <NAME,NAME|-> -- <command> [args...]');
    process.exit(2);
  }
  const names = list === '-' ? [] : list.split(',');
  const run = spawnArgs(command, args);
  const child = spawn(run.command, run.args, { stdio: 'inherit', windowsHide: true, shell: run.shell, env: serverEnv(names, process.env, readEnvFile(envFile)) });
  child.on('error', error => { console.error(`mcp-launch: ${error.message}`); process.exit(1); });
  child.on('exit', code => process.exit(code ?? 1));
}
