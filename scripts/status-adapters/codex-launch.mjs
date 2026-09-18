import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readConfig, withoutStatusSecrets } from './config.mjs';
import { LocalStatusStore } from './local-store.mjs';

export { readConfig } from './config.mjs';
const hookFile = fileURLToPath(new URL('./codex-hook.mjs', import.meta.url)).replaceAll('\\', '/');
const workerFile = fileURLToPath(new URL('./worker.mjs', import.meta.url));
const versionFailureCodes = new Set(['VERSION_TIMEOUT', 'VERSION_EXECUTABLE_UNAVAILABLE',
  'VERSION_COMMAND_FAILED', 'VERSION_MISMATCH']);
const configurationFailureCodes = new Set(['CONFIGURATION_NOT_FOUND', 'CONFIGURATION_ACCESS_DENIED',
  'CONFIGURATION_READ_FAILED', 'CONFIGURATION_TOO_LARGE', 'CONFIGURATION_JSON_INVALID',
  'CONFIGURATION_SCHEMA_INVALID', 'CONFIGURATION_REPOSITORY_LOCAL', 'CONFIGURATION_ENDPOINT_INVALID']);
let launchFailureCode = 'ARGUMENT_VALIDATION_FAILED';

export function validateCodexVersion(result) {
  if (result.error?.code === 'ETIMEDOUT') throw new Error('VERSION_TIMEOUT');
  if (result.error) throw new Error('VERSION_EXECUTABLE_UNAVAILABLE');
  if (result.status !== 0) throw new Error('VERSION_COMMAND_FAILED');
  if (result.stdout?.trim() !== 'codex-cli 0.153.4') throw new Error('VERSION_MISMATCH');
}

export function buildStatusHookOverrides({ storePath, instanceId, ownerId }) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(instanceId) || !/^[a-f0-9]{24}$/.test(ownerId)
    || typeof storePath !== 'string' || /['"\r\n]/.test(storePath) || /['\r\n]/.test(hookFile)) throw new Error('Invalid status hook configuration');
  const args = ['--enable', 'hooks'];
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Interrupt', 'SessionEnd']) {
    const command = `node --no-warnings "${hookFile}" "${storePath.replaceAll('\\', '/')}" ${instanceId} ${ownerId} ${event}`;
    args.push('-c', `hooks.${event}=[{hooks = [{type = 'command', command = '${command}', commandWindows = '${command}', timeout = 3}]}]`);
  }
  return args;
}

export function validateCodexArguments(args) {
  const blocked = new Set(['exec', 'review', 'resume', 'fork', 'login', 'logout', 'app-server',
    '--remote', '--remote-auth-token-env', '--dangerously-bypass-hook-trust']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (blocked.has(arg.split('=')[0]) || /^--disable(?:=hooks)?$/.test(arg)
      || ((arg === '-c' || arg === '--config') && /^(hooks\.|features\.hooks)/.test(args[i + 1] ?? ''))
      || /^(--config=|-c)(hooks\.|features\.hooks)/.test(arg)) throw new Error('Unsupported Codex status launch override');
  }
}

export function isWorkerRunning(worker) {
  return Boolean(worker && worker.pid !== undefined && worker.exitCode === null && worker.signalCode === null);
}

async function launch() {
  const [configPath, executable, ...args] = process.argv.slice(2);
  validateCodexArguments(args);
  launchFailureCode = 'VERSION_COMMAND_FAILED';
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
  validateCodexVersion(version);
  launchFailureCode = 'CONFIGURATION_FAILED';
  const config = readConfig(configPath);
  const ownerId = randomBytes(12).toString('hex');
  let store;
  let statusAvailable = true;
  try { store = new LocalStatusStore(config.storePath, config.instanceId); store.registerOwner(ownerId); }
  catch { statusAvailable = false; }
  // Start Codex even if the local status store/reporter cannot operate.
  const environment = withoutStatusSecrets(process.env);
  environment.PATH = dirname(process.execPath) + ';' + (environment.PATH ?? environment.Path ?? '');
  let worker;
  let nextRestart = 0;
  const startWorker = () => {
    if (!statusAvailable || isWorkerRunning(worker) || Date.now() < nextRestart) return;
    nextRestart = Date.now() + 5000;
    worker = spawn(process.execPath, ['--no-warnings', workerFile, resolve(configPath)], {
      stdio: 'ignore', windowsHide: true, env: environment,
    });
    worker.on('error', () => { worker = undefined; });
    worker.unref();
  };
  startWorker();
  const interval = setInterval(() => {
    try { store?.renewOwner(ownerId); } catch { /* Never fail Codex on status I/O. */ }
    startWorker();
  }, 5000);
  launchFailureCode = 'HOOK_CONFIGURATION_FAILED';
  const hooks = statusAvailable ? buildStatusHookOverrides({ ...config, ownerId }) : [];
  launchFailureCode = 'PROCESS_LAUNCH_FAILED';
  const child = spawn(executable, [...args, ...hooks], { stdio: 'inherit', shell: false, env: environment });
  // Ctrl+C belongs to Codex's TUI. Do not terminate the owner/reporter while Codex handles Interrupt.
  const onInterrupt = () => {};
  process.on('SIGINT', onInterrupt);
  let code;
  try {
    code = await new Promise(resolveExit => {
      child.on('error', () => resolveExit(1));
      child.on('exit', value => resolveExit(value ?? 1));
    });
  } finally {
    clearInterval(interval);
    process.removeListener('SIGINT', onInterrupt);
    try { store?.releaseOwner(ownerId); store?.close(); } catch { /* Lease expiry handles crash cleanup. */ }
    // Worker is intentionally allowed to flush the final aggregate idle event, then exit.
  }
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await launch(); }
  catch (error) {
    const code = configurationFailureCodes.has(error?.code) ? error.code
      : versionFailureCodes.has(error?.message) ? error.message : launchFailureCode;
    console.error(`Codex status launcher configuration/version check failed [${code}]. No secrets or hooks were changed.`);
    process.exitCode = 1;
  }
}
