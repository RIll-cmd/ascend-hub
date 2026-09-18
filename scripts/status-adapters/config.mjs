import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEndpoint } from './reporter.mjs';

function configurationError(code) {
  return Object.assign(new Error(`Invalid status configuration [${code}]`), { code });
}

export function readConfig(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (error) {
    throw configurationError(error.code === 'ENOENT' ? 'CONFIGURATION_NOT_FOUND'
      : ['EACCES', 'EPERM'].includes(error.code) ? 'CONFIGURATION_ACCESS_DENIED' : 'CONFIGURATION_READ_FAILED');
  }
  if (text.length > 4096) throw configurationError('CONFIGURATION_TOO_LARGE');
  let value;
  try { value = JSON.parse(text); }
  catch { throw configurationError('CONFIGURATION_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1
    || typeof value.instanceId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.instanceId)
    || Object.keys(value).some(key => !['schemaVersion', 'instanceId', 'coreEventsUrl'].includes(key))) {
    throw configurationError('CONFIGURATION_SCHEMA_INVALID');
  }
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const relation = relative(repo, resolve(path));
  if (!isAbsolute(relation) && relation !== '..' && !relation.startsWith('..' + sep)) throw configurationError('CONFIGURATION_REPOSITORY_LOCAL');
  let endpoint;
  try { endpoint = validateEndpoint(value.coreEventsUrl); }
  catch { throw configurationError('CONFIGURATION_ENDPOINT_INVALID'); }
  return { instanceId: value.instanceId, endpoint,
    storePath: join(dirname(resolve(path)), 'status.sqlite'),
    credentialPath: join(dirname(resolve(path)), 'credential.dpapi') };
}

export function readProducerCredential(path) {
  if (process.platform !== 'win32') throw new Error('Windows user-bound secret storage required');
  const encrypted = readFileSync(path, 'utf8').trim();
  if (!/^[a-f0-9]{64,16384}$/i.test(encrypted)) throw new Error('Invalid encrypted producer credential');
  const command = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $hex=[Console]::In.ReadLine(); $bytes=New-Object byte[] ($hex.Length/2); for($i=0;$i -lt $bytes.Length;$i++){ $bytes[$i]=[Convert]::ToByte($hex.Substring($i*2,2),16) }; $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain)) } finally { [Array]::Clear($plain,0,$plain.Length) }";
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    input: encrypted + '\n', encoding: 'utf8', timeout: 3000, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

export function withoutStatusSecrets(environment) {
  const safe = { ...environment };
  for (const key of Object.keys(safe)) {
    if (/^(ASCEND.*(CREDENTIAL|TOKEN|SECRET)|ASCEND_SHELF_READ_CREDENTIAL)$/i.test(key)) delete safe[key];
  }
  return safe;
}
