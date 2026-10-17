import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { roomError } from './paths.mjs';
import { excludeFromGit } from './project.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

// Specialist roles an agent can wear. Each set is a list of third-party agent skills (SKILL.md folders);
// the owner turns sets and single skills on or off, and only skills found in the library are used.
const skill = (id, name, source, on = true) => ({ id, name, source, on });
const ANTHROPIC_SKILLS = 'https://github.com/anthropics/skills';
const VERCEL_SKILLS = 'https://github.com/vercel-labs/agent-skills';
const WSHOBSON = 'https://github.com/wshobson/agents/tree/main/plugins/backend-development/skills';
const TRAIL_OF_BITS = 'https://github.com/trailofbits/skills';
const GUIDELINES = skill('web-interface-guidelines', 'Vercel web interface guidelines', 'https://github.com/vercel-labs/web-interface-guidelines');

export const ROLE_SETS = [
  { id: 'ui-ux', name: 'UI/UX', prompt: 'You own the design: layout, hierarchy, accessibility and visual polish.', skills: [
    skill('impeccable', 'Impeccable', 'https://impeccable.style/'),
    skill('frontend-design', 'Anthropic frontend design', ANTHROPIC_SKILLS),
    skill('ui-ux-pro-max', 'UI UX Pro Max', 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill'),
    GUIDELINES,
  ] },
  { id: 'frontend', name: 'Frontend', prompt: 'You build the interface in code: components, state, performance and accessibility.', skills: [
    skill('react-best-practices', 'Vercel React best practices', VERCEL_SKILLS),
    skill('composition-patterns', 'Vercel composition patterns', VERCEL_SKILLS),
    GUIDELINES,
    skill('magic-ui', 'Magic UI', 'https://github.com/magicuidesign/magicui/tree/main/skills/magic-ui'),
  ] },
  { id: 'code-reviewer', name: 'Code reviewer', prompt: 'You review changes for bugs, risky patterns and missing tests.', skills: [
    skill('code-review', 'Sentry code review', 'https://github.com/getsentry/skills'),
    skill('pr-review-toolkit', 'Anthropic PR review toolkit', 'https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit'),
  ] },
  { id: 'backend', name: 'Backend', prompt: 'You build the server side: APIs, data models and architecture.', skills: [
    skill('api-design-principles', 'API design principles', WSHOBSON),
    skill('architecture-patterns', 'Architecture patterns', WSHOBSON),
    skill('supabase-postgres', 'Supabase Postgres best practices', 'https://github.com/supabase/agent-skills', false),
  ] },
  // Semgrep and CodeQL are optional: the review skills still work without them.
  { id: 'security', name: 'Security', prompt: 'You look for security flaws in the changes and say how to fix them.', skills: [
    skill('differential-review', 'Trail of Bits differential review', TRAIL_OF_BITS),
    skill('static-analysis', 'Trail of Bits static analysis', TRAIL_OF_BITS),
  ] },
];

const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SCRIPT_EXT = new Set(['.sh', '.bash', '.ps1', '.psm1', '.bat', '.cmd', '.py', '.js', '.mjs', '.cjs', '.ts', '.rb', '.exe']);
const isRealDir = path => existsSync(path) && lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink();

export const skillId = value => typeof value === 'string' && SKILL_ID.test(value);
export const hasScriptFiles = paths => paths.some(f => SCRIPT_EXT.has(extname(String(f)).toLowerCase()));

export function frontMatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const field = key => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1].trim().replace(/^(["'])(.*)\1$/, '$2') ?? '';
  return { name: field('name'), description: field('description') };
}

function skillDir(dataDir, id) {
  if (!skillId(id)) throw roomError('SKILL_ID_INVALID', String(id));
  const dir = join(dataDir, 'skills', id);
  if (!existsSync(join(dir, 'SKILL.md'))) throw roomError('SKILL_NOT_FOUND', id);
  return dir;
}

export const viewSkill = (dataDir, id) => readFileSync(join(skillDir(dataDir, id), 'SKILL.md'), 'utf8');

export function removeSkill(dataDir, id) {
  rmSync(skillDir(dataDir, id), { recursive: true, force: true });
}

function stagedDir(dataDir, token) {
  const dir = join(dataDir, 'skills-staging', String(token));
  if (!/^[0-9a-f]{16}$/.test(String(token)) || !existsSync(join(dir, 'meta.json'))) throw roomError('SKILL_STAGE_MISSING');
  return dir;
}

export function discardStaged(dataDir, token) {
  rmSync(stagedDir(dataDir, token), { recursive: true, force: true });
}

// The owner's Install: the staged folder (see github.mjs) replaces any installed copy, with source.json pinning where it came from.
export function installStaged(dataDir, token, id) {
  const stage = stagedDir(dataDir, token);
  const meta = readJson(join(stage, 'meta.json'));
  const target = id ?? meta.id;
  if (!skillId(target)) throw roomError('SKILL_ID_INVALID', String(target));
  const dir = join(dataDir, 'skills', target);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dataDir, 'skills'), { recursive: true });
  renameSync(join(stage, 'files'), dir);
  const { url, owner, repo, path, commit, license } = meta;
  writeJsonAtomic(join(dir, 'source.json'), { url, owner, repo, path, commit, license, fetchedAt: new Date().toISOString() });
  rmSync(stage, { recursive: true, force: true });
  return { id: target };
}

// The library: <dataDir>/skills/<id>/SKILL.md, plus an optional source.json recording where it came from.
export function listSkills(dataDir) {
  const root = join(dataDir, 'skills');
  if (!isRealDir(root)) return [];
  return readdirSync(root).filter(id => SKILL_ID.test(id) && isRealDir(join(root, id)) && existsSync(join(root, id, 'SKILL.md'))).sort().map(id => {
    const dir = join(root, id);
    const { name, description } = frontMatter(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
    const hasScripts = hasScriptFiles(readdirSync(dir, { recursive: true }));
    let source = null;
    try { source = readJson(join(dir, 'source.json')); } catch { /* a broken source.json only hides the source */ }
    return { id, name: name || id, description, hasScripts, source };
  });
}

const storeFile = dataDir => join(dataDir, 'role-sets.json');
const stored = dataDir => readJson(storeFile(dataDir), {})?.sets ?? {};

// The sets as the room shows them: defaults, then the owner's switches, then what the library holds.
export function readRoleSets(dataDir) {
  const library = new Map(listSkills(dataDir).map(s => [s.id, s]));
  const saved = stored(dataDir);
  return ROLE_SETS.map(set => ({
    id: set.id, name: set.name, prompt: set.prompt, on: saved[set.id]?.on ?? false,
    skills: set.skills.map(k => ({
      id: k.id, name: k.name, source: k.source, on: saved[set.id]?.skills?.[k.id] ?? k.on,
      installed: library.has(k.id), description: library.get(k.id)?.description ?? '', hasScripts: library.get(k.id)?.hasScripts ?? false,
    })),
  }));
}

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// body: { sets: { [setId]: { on?: boolean, skills?: { [skillId]: boolean } } } }, merged into what is saved.
export function writeRoleSets(dataDir, body) {
  if (!isObject(body?.sets)) throw roomError('ROLE_SET_INVALID');
  const saved = stored(dataDir);
  for (const [id, change] of Object.entries(body.sets)) {
    const set = ROLE_SETS.find(s => s.id === id);
    if (!set || !isObject(change)) throw roomError('ROLE_SET_INVALID', id);
    const next = { ...saved[id], skills: { ...saved[id]?.skills } };
    if ('on' in change) {
      if (typeof change.on !== 'boolean') throw roomError('ROLE_SET_INVALID', id);
      next.on = change.on;
    }
    if ('skills' in change) {
      if (!isObject(change.skills)) throw roomError('ROLE_SET_INVALID', id);
      for (const [skillId, on] of Object.entries(change.skills)) {
        if (!set.skills.some(k => k.id === skillId) || typeof on !== 'boolean') throw roomError('ROLE_SET_INVALID', `${id}/${skillId}`);
        next.skills[skillId] = on;
      }
    }
    saved[id] = next;
  }
  writeJsonAtomic(storeFile(dataDir), { sets: saved });
  return readRoleSets(dataDir);
}

// What a new session takes: the sets that are on, each with its switched-on skills found in the library.
// The session keeps this snapshot, so later switches never change a running session.
export function activeRoleSets(dataDir) {
  return readRoleSets(dataDir).filter(s => s.on).map(s => ({
    id: s.id, name: s.name, prompt: s.prompt,
    skills: s.skills.filter(k => k.on && k.installed).map(k => ({ id: k.id, name: k.name, description: k.description })),
  }));
}

// Copies the sets' skills to <dir>/.ascend/skills/<id>/ so every CLI can read them inside its own folder.
// .ascend/ is excluded from git, so the room never commits them and rollbacks (git clean without -x) keep them.
export function installSkills(dataDir, roleSets, dir) {
  const ids = [...new Set(roleSets.flatMap(s => s.skills.map(k => k.id)))];
  if (!ids.length) return;
  excludeFromGit(dir, '.ascend/');
  for (const id of ids) {
    // Links inside a skill folder could point anywhere on disk, so they are not copied.
    cpSync(join(dataDir, 'skills', id), join(dir, '.ascend', 'skills', id), { recursive: true, filter: src => !lstatSync(src).isSymbolicLink() });
  }
}

const INDEX_CHARS = 1500;

// A short list of the set's skills for a coder's prompt: the agent reads the SKILL.md files it needs itself.
export function skillIndex(set) {
  const lines = [];
  let used = 0;
  for (const [i, k] of set.skills.entries()) {
    const line = `- ${k.name}: ${k.description.slice(0, 160)} (.ascend/skills/${k.id}/SKILL.md)`;
    if (used + line.length > INDEX_CHARS) {
      lines.push(`- ${set.skills.length - i} more skills in .ascend/skills/`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}
