import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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
