import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { roomError } from './paths.mjs';
import { excludeFromGit } from './project.mjs';
import { scanText } from './skill-scan.mjs';
import { readUsage, usageOf } from './skill-usage.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

// Specialist roles an agent can wear. Each set is a list of third-party agent skills (SKILL.md folders);
// the owner turns sets and single skills on or off, and only skills found in the library are used.
// Each source is the skill's own folder on GitHub, so the library's Fetch button lands on it directly.
const skill = (id, name, source, on = true) => ({ id, name, source, on });
const gh = (repo, path, branch = 'main') => `https://github.com/${repo}/tree/${branch}/${path}`;
const VERCEL = name => gh('vercel-labs/agent-skills', `skills/${name}`);
const ADDY = name => gh('addyosmani/web-quality-skills', `skills/${name}`);
const EMIL = name => gh('emilkowalski/skills', `skills/${name}`);
const SUPERPOWERS = name => gh('obra/superpowers', `skills/${name}`);
const TRAIL_OF_BITS = (plugin, name = plugin) => gh('trailofbits/skills', `plugins/${plugin}/skills/${name}`);
const WSHOBSON = (plugin, name) => gh('wshobson/agents', `plugins/${plugin}/skills/${name}`);
const GUIDELINES = skill('web-interface-guidelines', 'Vercel web interface guidelines', VERCEL('web-design-guidelines'));

// always: the set's skills go to every coder task, not only tasks with its role.
export const ROLE_SETS = [
  { id: 'general', name: 'General', always: true, prompt: 'Habits for every task: find the root cause, verify before claiming done, keep changes small, check current docs.', skills: [
    skill('systematic-debugging', 'Superpowers systematic debugging', SUPERPOWERS('systematic-debugging')),
    skill('verification-before-completion', 'Superpowers verification before completion', SUPERPOWERS('verification-before-completion')),
    skill('ponytail', 'Ponytail (smallest complete change)', gh('dietrichgebert/ponytail', 'skills/ponytail')),
    skill('context7', 'Context7 docs lookup', gh('upstash/context7', 'skills/find-docs', 'master')),
    skill('caveman', 'Caveman (terse replies)', gh('JuliusBrussee/caveman', 'skills/caveman')),
  ] },
  { id: 'ui-ux', name: 'UI/UX', prompt: 'You own the design: layout, hierarchy, accessibility and visual polish.', skills: [
    skill('impeccable', 'Impeccable', gh('pbakaus/impeccable', 'plugin/skills/impeccable')),
    skill('frontend-design', 'Anthropic frontend design', gh('anthropics/skills', 'skills/frontend-design')),
    skill('emil-design-eng', 'Emil Kowalski design engineering', EMIL('emil-design-eng')),
    skill('accessibility', 'Addy Osmani accessibility', ADDY('accessibility')),
    GUIDELINES,
    // 3.6 MB of data files plus Python scripts the agent runs; read them before switching it on.
    skill('ui-ux-pro-max', 'UI UX Pro Max', gh('nextlevelbuilder/ui-ux-pro-max-skill', '.claude/skills/ui-ux-pro-max'), false),
    skill('animation-performance', 'Emil Kowalski animation performance', EMIL('animation-performance'), false),
  ] },
  { id: 'frontend', name: 'Frontend', prompt: 'You build the interface in code: components, state, performance and accessibility.', skills: [
    skill('react-best-practices', 'Vercel React best practices', VERCEL('react-best-practices')),
    skill('composition-patterns', 'Vercel composition patterns', VERCEL('composition-patterns')),
    skill('performance', 'Addy Osmani performance', ADDY('performance')),
    GUIDELINES,
    skill('magic-ui', 'Magic UI', gh('magicuidesign/magicui', 'skills/magic-ui')),
    // Both drive the 21st CLI (npx @21st-dev/cli), which needs a 21st.dev login or API key on this machine.
    skill('21st-ui-build', '21st.dev UI build', gh('21st-dev/skill', 'skills/21st-ui-build'), false),
    skill('21st-cli-use', '21st.dev CLI (search and install components)', gh('21st-dev/skill', 'skills/21st-cli-use'), false),
  ] },
  { id: 'code-reviewer', name: 'Code reviewer', prompt: 'You review changes for bugs, risky patterns and missing tests.', skills: [
    skill('code-review', 'Sentry code review', gh('getsentry/skills', 'skills/code-review')),
    skill('variant-analysis', 'Trail of Bits variant analysis', TRAIL_OF_BITS('variant-analysis')),
  ] },
  { id: 'backend', name: 'Backend', prompt: 'You build the server side: APIs, data models and architecture.', skills: [
    skill('api-design-principles', 'API design principles', WSHOBSON('backend-development', 'api-design-principles')),
    skill('architecture-patterns', 'Architecture patterns', WSHOBSON('backend-development', 'architecture-patterns')),
    skill('error-handling-patterns', 'Error handling patterns', WSHOBSON('developer-essentials', 'error-handling-patterns')),
    skill('supabase-postgres', 'Supabase Postgres best practices', gh('supabase/agent-skills', 'skills/supabase-postgres-best-practices'), false),
    skill('better-auth', 'Better Auth best practices', gh('better-auth/skills', 'better-auth/best-practices'), false),
  ] },
  // Semgrep and CodeQL are optional: the review skills still work without them.
  { id: 'security', name: 'Security', prompt: 'You look for security flaws in the changes and say how to fix them.', skills: [
    skill('differential-review', 'Trail of Bits differential review', TRAIL_OF_BITS('differential-review')),
    skill('static-analysis', 'Trail of Bits Semgrep', TRAIL_OF_BITS('static-analysis', 'semgrep')),
    skill('supply-chain-risk-auditor', 'Trail of Bits supply chain risk auditor', TRAIL_OF_BITS('supply-chain-risk-auditor')),
  ] },
  { id: 'testing', name: 'Testing / QA', prompt: 'You prove the work: tests first, real browser checks, and edge cases.', skills: [
    // The skill drives the playwright-cli program, which is installed separately (npm install -g @playwright/cli).
    skill('playwright-cli', 'Microsoft Playwright CLI', gh('microsoft/playwright-cli', 'skills/playwright-cli')),
    skill('test-driven-development', 'Superpowers test-driven development', SUPERPOWERS('test-driven-development')),
    skill('property-based-testing', 'Trail of Bits property-based testing', TRAIL_OF_BITS('property-based-testing')),
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
  // A saved proposal leaves the sets it was added to, so a later skill with the same id does not land there.
  const saved = stored(dataDir);
  if (!Object.values(saved).some(set => set?.extra?.includes(id))) return;
  const sets = Object.fromEntries(Object.entries(saved).map(([key, set]) => {
    if (!set?.extra?.includes(id)) return [key, set];
    const skills = Object.fromEntries(Object.entries(set.skills ?? {}).filter(([skill]) => skill !== id));
    return [key, { ...set, skills, extra: set.extra.filter(x => x !== id) }];
  }));
  writeJsonAtomic(storeFile(dataDir), { sets });
}

function stagedDir(dataDir, token) {
  const dir = join(dataDir, 'skills-staging', String(token));
  if (!/^[0-9a-f]{16}$/.test(String(token)) || !existsSync(join(dir, 'meta.json'))) throw roomError('SKILL_STAGE_MISSING');
  return dir;
}

export function discardStaged(dataDir, token) {
  rmSync(stagedDir(dataDir, token), { recursive: true, force: true });
}

// A skill the agents proposed at a result gate, as the owner edited it: written to the library with front matter, scanned
// like a fetched skill (a finding needs confirm: true), and added to one role set, switched on.
export function saveProposedSkill(dataDir, { id, name, description, body, set, session, confirm = false } = {}) {
  const line = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const title = line(name);
  const summary = line(description);
  if (!title || title.length > 60 || !summary || summary.length > 300) throw roomError('SKILL_PROPOSAL_INVALID', 'A skill needs a name (60 characters) and a description (300).');
  if (typeof body !== 'string' || !body.trim() || body.length > 12_000) throw roomError('SKILL_PROPOSAL_INVALID', 'The skill text must be 1 to 12,000 characters.');
  if (!ROLE_SETS.some(s => s.id === set)) throw roomError('ROLE_SET_INVALID', String(set));
  const target = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  if (!skillId(target)) throw roomError('SKILL_ID_INVALID', String(target));
  const dir = join(dataDir, 'skills', target);
  if (existsSync(dir)) throw roomError('SKILL_EXISTS', `A skill called ${target} is already in the library.`);
  const text = `---\nname: ${title}\ndescription: ${summary}\n---\n\n${body.trim()}\n`;
  // Lines 2 and 3 are the name and description, the steps start on line 6: report where the owner typed it.
  const findings = scanText('SKILL.md', text).map(f => ({ ...f, part: f.line === 2 ? 'name' : f.line === 3 ? 'description' : 'steps', line: f.line > 5 ? f.line - 5 : null }));
  if (findings.length && confirm !== true) throw Object.assign(roomError('SKILL_SCAN', 'The safety scan flagged lines in this skill; read them, then save again to confirm.'), { findings });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), text, 'utf8');
  writeJsonAtomic(join(dir, 'source.json'), { origin: 'session', session: typeof session === 'string' ? session : null, savedAt: new Date().toISOString() });
  const saved = stored(dataDir);
  const next = { ...saved[set], skills: { ...saved[set]?.skills, [target]: true }, extra: [...new Set([...(saved[set]?.extra ?? []), target])] };
  writeJsonAtomic(storeFile(dataDir), { sets: { ...saved, [set]: next } });
  return { id: target, findings };
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
  const usage = readUsage(dataDir);
  return readdirSync(root).filter(id => SKILL_ID.test(id) && isRealDir(join(root, id)) && existsSync(join(root, id, 'SKILL.md'))).sort().map(id => {
    const dir = join(root, id);
    const { name, description } = frontMatter(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
    const hasScripts = hasScriptFiles(readdirSync(dir, { recursive: true }));
    let source = null;
    try { source = readJson(join(dir, 'source.json')); } catch { /* a broken source.json only hides the source */ }
    return { id, name: name || id, description, hasScripts, source, usage: usageOf(usage, id) };
  });
}

const storeFile = dataDir => join(dataDir, 'role-sets.json');
const stored = dataDir => readJson(storeFile(dataDir), {})?.sets ?? {};

// The sets as the room shows them: defaults, then the owner's switches, then what the library holds. A set's "extra"
// skills are ones the owner added to it, such as a skill the agents proposed at a result gate.
export function readRoleSets(dataDir) {
  const library = new Map(listSkills(dataDir).map(s => [s.id, s]));
  const saved = stored(dataDir);
  const known = k => ({ installed: library.has(k.id), description: library.get(k.id)?.description ?? '', hasScripts: library.get(k.id)?.hasScripts ?? false,
    usage: library.get(k.id)?.usage ?? null });
  return ROLE_SETS.map(set => ({
    id: set.id, name: set.name, prompt: set.prompt, always: Boolean(set.always), on: saved[set.id]?.on ?? false,
    skills: [
      ...set.skills.map(k => ({ id: k.id, name: k.name, source: k.source, on: saved[set.id]?.skills?.[k.id] ?? k.on, ...known(k) })),
      ...(saved[set.id]?.extra ?? []).filter(id => library.has(id) && !set.skills.some(k => k.id === id))
        .map(id => ({ id, name: library.get(id).name, source: library.get(id).source?.url ?? '', on: saved[set.id]?.skills?.[id] ?? true, ...known({ id }) })),
    ],
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
        const inSet = set.skills.some(k => k.id === skillId) || (saved[id]?.extra ?? []).includes(skillId);
        if (!inSet || typeof on !== 'boolean') throw roomError('ROLE_SET_INVALID', `${id}/${skillId}`);
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
// only: the set ids one session chose for itself, instead of the switches.
export function activeRoleSets(dataDir, only = null) {
  if (only !== null && (!Array.isArray(only) || !only.every(id => ROLE_SETS.some(s => s.id === id)))) throw roomError('ROLE_SETS_INVALID');
  return readRoleSets(dataDir).filter(s => (only ? only.includes(s.id) : s.on)).map(s => ({
    id: s.id, name: s.name, prompt: s.prompt, always: s.always,
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
