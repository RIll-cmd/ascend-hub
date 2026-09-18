import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readConfig, withoutStatusSecrets } from './config.mjs';
import { AntigravityStatusStore } from './antigravity-store.mjs';

const hookFile = fileURLToPath(new URL('./antigravity-hook.mjs', import.meta.url));
const workerFile = fileURLToPath(new URL('./antigravity-worker.mjs', import.meta.url));
const hookName = 'ascend-status-antigravity-cli';
const fail = code => { throw Object.assign(new Error(code), { code }); };

export function validateAntigravityVersion(result) {
  if (result.error?.code === 'ETIMEDOUT') fail('VERSION_TIMEOUT');
  if (result.error) fail('VERSION_EXECUTABLE_UNAVAILABLE');
  if (result.status !== 0) fail('VERSION_COMMAND_FAILED');
  if (!['1.2.5', '1.2.6'].includes(result.stdout?.trim())) fail('VERSION_MISMATCH');
}

export function validateAntigravityArguments(args) {
  // This verified path is interactive, with ordinary vendor hook/workspace trust.
  if (args.some(arg => !['--help', '--version'].includes(arg))) fail('ARGUMENT_VALIDATION_FAILED');
}

function hookDefinition(legacy = false) {
  // The verified Windows cmd /c native argument boundary escapes embedded quotes.
  // Production Node/repo paths must be shell-safe and have no whitespace.
  if (/[\s"'%&|<>^()!]/.test(process.execPath + hookFile)) fail('HOOK_COMMAND_PATH_INVALID');
  const handler = event => ({ type: 'command',
    command: `${process.execPath} --no-warnings ${legacy ? `"${hookFile}"` : hookFile} ${event}`, timeout: 3 });
  return { enabled: true, PreInvocation: [handler('PreInvocation')], PostInvocation: [handler('PostInvocation')],
    Stop: [handler('Stop')], PostToolUse: [{ matcher: '.*', hooks: [handler('PostToolUse')] }] };
}

export const antigravityHookDefinition = () => hookDefinition();

function hookPaths(workspace) {
  const directory = join(resolve(workspace), '.agents');
  if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) fail('HOOK_DIRECTORY_INVALID');
  const path = join(directory, 'hooks.json');
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) fail('HOOK_FILE_INVALID');
  return { directory, path };
}

function readHooks(path) {
  if (!existsSync(path)) return {};
  if (lstatSync(path).size > 256 * 1024) fail('HOOK_FILE_TOO_LARGE');
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { fail('HOOK_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('HOOK_SCHEMA_INVALID');
  return value;
}

export function verifyAntigravityHooks(workspace) {
  const { path } = hookPaths(workspace);
  return JSON.stringify(readHooks(path)[hookName]) === JSON.stringify(antigravityHookDefinition());
}

export function installAntigravityHooks(workspace) {
  const { directory, path } = hookPaths(workspace);
  mkdirSync(directory, { recursive: true });
  const lockPath = path + '.ascend-lock';
  let lock;
  let temporary;
  try {
    try { lock = openSync(lockPath, 'wx', 0o600); } catch { fail('HOOK_INSTALL_LOCKED'); }
    const existing = readHooks(path);
    const definition = antigravityHookDefinition();
    if (existing[hookName]) {
      const installed = JSON.stringify(existing[hookName]);
      if (installed === JSON.stringify(definition)) return;
      if (installed !== JSON.stringify(hookDefinition(true))) fail('HOOK_NAME_CONFLICT');
      // Upgrade only the exact previous Ascend-generated command, never an unknown customization.
    }
    const text = JSON.stringify({ ...existing, [hookName]: definition }, null, 2) + '\n';
    temporary = path + '.' + randomBytes(12).toString('hex') + '.tmp';
    writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
    temporary = undefined;
  } finally {
    if (temporary) try { unlinkSync(temporary); } catch { /* No content logging. */ }
    if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
  }
}

export async function superviseAntigravity({ config, configPath, executable, args = [], workspace = process.cwd() }) {
  const ownerId = randomBytes(12).toString('hex');
  let store;
  try { store = new AntigravityStatusStore(config.storePath, config.instanceId); store.registerOwner(ownerId); }
  catch { try { store?.close(); } catch { /* Neutral. */ } store = undefined; }
  const environment = withoutStatusSecrets(process.env);
  for (const key of Object.keys(environment)) if (/^ASCEND_AGY_STATUS_/i.test(key)) delete environment[key];
  if (store) Object.assign(environment, { ASCEND_AGY_STATUS_STORE: config.storePath,
    ASCEND_AGY_STATUS_INSTANCE: config.instanceId, ASCEND_AGY_STATUS_OWNER: ownerId });
  let worker;
  let nextRestart = 0;
  const startWorker = () => {
    if (!store || (worker?.pid && worker.exitCode === null && worker.signalCode === null) || Date.now() < nextRestart) return;
    nextRestart = Date.now() + 5000;
    worker = spawn(process.execPath, ['--no-warnings', workerFile, resolve(configPath)], {
      stdio: 'ignore', detached: true, windowsHide: true, env: withoutStatusSecrets(process.env),
    });
    worker.on('error', () => { worker = undefined; });
    worker.unref();
  };
  // Leave Ctrl+C to the real interactive child; its eventual exit closes the session.
  const onInterrupt = () => {};
  process.on('SIGINT', onInterrupt);
  let interval;
  try {
    const child = spawn(executable, args, { cwd: workspace, env: environment, stdio: 'inherit', shell: false });
    child.once('spawn', () => {
      try { store?.startWrapper(ownerId); } catch { /* Agent continues normally. */ }
      startWorker();
      interval = setInterval(() => {
        try { store?.renewOwner(ownerId); } catch { /* Expiry provides durable recovery. */ }
        startWorker();
      }, 5000);
    });
    await new Promise(resolveExit => {
      child.once('error', () => resolveExit());
      child.once('close', () => resolveExit());
    });
  } finally {
    clearInterval(interval);
    process.removeListener('SIGINT', onInterrupt);
    try { store?.releaseOwner(ownerId); store?.close(); } catch { /* Durable lease expiry closes orphaned work. */ }
    // Worker flushes the final aggregate event with bounded retries, releases its lease and exits.
  }
}

async function launch() {
  const [configPath, executable, workspace, ...args] = process.argv.slice(2);
  validateAntigravityArguments(args.filter(arg => arg !== '--install-hooks'));
  validateAntigravityVersion(spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 3000, windowsHide: true }));
  const config = readConfig(configPath);
  if (args.includes('--install-hooks')) {
    installAntigravityHooks(workspace);
    console.log('Installed the named Antigravity status hooks. Existing customization was preserved.');
    return;
  }
  if (!verifyAntigravityHooks(workspace)) fail('HOOK_INSTALL_REQUIRED');
  await superviseAntigravity({ config, configPath, executable, args, workspace });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await launch(); }
  catch (error) {
    const code = /^(VERSION_|CONFIGURATION_|HOOK_|ARGUMENT_)[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'LAUNCH_FAILED';
    console.error(`Antigravity status launcher check failed [${code}].`);
    process.exitCode = 1;
  }
}
