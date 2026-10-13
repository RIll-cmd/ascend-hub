import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function roomError(code, detail) {
  return Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
}

export function roomDataDir(hubRoot) {
  return join(hubRoot, '.sites-runtime', 'agent-room');
}

export function resolveProjectDir(buildsRoot, name, { allowExisting = false } = {}) {
  if (typeof name !== 'string' || !PROJECT_NAME.test(name)) throw roomError('PROJECT_NAME_INVALID');
  const root = resolve(buildsRoot);
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw roomError('BUILDS_ROOT_IS_LINK');
  const dir = join(root, name);
  // The name rule already forbids separators; this guards the rule itself.
  if (dirname(dir) !== root) throw roomError('PROJECT_NAME_INVALID');
  if (existsSync(dir)) {
    if (lstatSync(dir).isSymbolicLink()) throw roomError('PROJECT_PATH_IS_LINK');
    if (!allowExisting) throw roomError('PROJECT_EXISTS');
  }
  return dir;
}

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const isRealDir = path => existsSync(path) && lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink();

// Debates read code but never write, so they may look at the Ascend repos or an existing build project.
export function resolveDebateFolder(folder, { debateFolders = [], buildsRoot }) {
  if (typeof folder !== 'string' || !folder.trim()) throw roomError('FOLDER_NOT_ALLOWED');
  const wanted = resolve(folder);
  const allowed = debateFolders.map(f => resolve(f)).find(f => samePath(f, wanted) && isRealDir(f));
  if (allowed) return allowed;
  const root = resolve(buildsRoot);
  if (samePath(dirname(wanted), root) && PROJECT_NAME.test(basename(wanted).toLowerCase()) && isRealDir(wanted)) return join(root, basename(wanted));
  throw roomError('FOLDER_NOT_ALLOWED', folder);
}

export function listDebateFolders({ debateFolders = [], buildsRoot }) {
  const repos = debateFolders.map(f => resolve(f)).filter(isRealDir);
  const root = resolve(buildsRoot);
  const projects = existsSync(root)
    ? readdirSync(root).filter(name => PROJECT_NAME.test(name)).sort().map(name => join(root, name)).filter(isRealDir)
    : [];
  return [...repos, ...projects];
}
