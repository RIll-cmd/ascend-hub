import { execFileSync } from 'node:child_process';
import { backup } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readConfig } from './config.mjs';
import { AntigravityStatusStore } from './antigravity-store.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };

export async function exportAntigravityDeployment(sourceConfigPath, targetDirectory) {
  const config = readConfig(sourceConfigPath);
  const target = resolve(targetDirectory);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const relation = relative(repo, target);
  if (!isAbsolute(relation) && relation !== '..' && !relation.startsWith('..' + sep)) fail('DEPLOYMENT_REPOSITORY_LOCAL');
  if (existsSync(target)) fail('DEPLOYMENT_TARGET_EXISTS');
  const encryptedBytes = readFileSync(config.credentialPath);
  const encrypted = encryptedBytes.toString('utf8').trim();
  if (!/^[a-f0-9]{64,16384}$/i.test(encrypted)) fail('DEPLOYMENT_SECRET_FORMAT_INVALID');
  const configBytes = readFileSync(sourceConfigPath);
  const source = new AntigravityStatusStore(config.storePath, config.instanceId);
  try {
    const owners = source.db.prepare('SELECT COUNT(*) n FROM owners').get().n;
    const active = source.db.prepare('SELECT COUNT(*) n FROM operations WHERE ended_at IS NULL').get().n;
    const emitter = source.db.prepare('SELECT lease_until,pending FROM emitter').get();
    if (owners || active || emitter.lease_until > Date.now() || emitter.pending) fail('DEPLOYMENT_SOURCE_ACTIVE');
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const stage = target + '.stage-' + randomBytes(12).toString('hex');
    mkdirSync(stage, { mode: 0o700 });
    if (process.platform === 'win32') {
      const sid = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      if (!/^S-1-[0-9-]+$/.test(sid)) fail('DEPLOYMENT_ACL_FAILED');
      execFileSync('icacls.exe', [stage, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { timeout: 3000, windowsHide: true, stdio: 'ignore' });
    }
    // SQLite backup includes committed WAL state; no unsafe main-file-only database copy.
    await backup(source.db, join(stage, 'status.sqlite'));
    // Read/write preserves ciphertext bytes through packaged-app file virtualization;
    // native CopyFile/realpath on the protected secret is not a reliable boundary.
    writeFileSync(join(stage, 'credential.dpapi'), encryptedBytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(stage, 'config.json'), configBytes, { flag: 'wx', mode: 0o600 });
    renameSync(stage, target);
    return { instanceId: config.instanceId, configPath: join(target, 'config.json') };
  } finally { source.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await exportAntigravityDeployment(process.argv[2], process.argv[3]);
    console.log(JSON.stringify({ exported: true, ...result, credentialUnchanged: true }));
  } catch (error) {
    const code = /^DEPLOYMENT_[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'DEPLOYMENT_FAILED';
    console.error(`Antigravity host deployment failed [${code}]. No credential was created or rotated.`);
    process.exitCode = 1;
  }
}
