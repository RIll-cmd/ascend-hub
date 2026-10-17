import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { roomError } from './paths.mjs';
import { frontMatter, hasScriptFiles, skillId } from './skills.mjs';
import { writeJsonAtomic } from './store.mjs';

// Fetches one skill folder from GitHub at a pinned commit into a staging folder. Nothing reaches the library
// until the owner reads it and presses Install (installStaged in skills.mjs).
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_FILES = 200;
const MAX_FILE_BYTES = 512_000;
const MAX_TOTAL_BYTES = 1_000_000;
const invalid = detail => roomError('SKILL_URL_INVALID', detail ?? 'Use a https://github.com/<owner>/<repo>[/tree/<ref>/<folder>] link.');

export function parseGithubUrl(text) {
  // Dot segments are refused before the URL parser quietly resolves them.
  if (typeof text !== 'string' || /\/\.{1,2}(\/|$)|%2e/i.test(text)) throw invalid();
  let url;
  try { url = new URL(text); } catch { throw invalid(); }
  if (url.protocol !== 'https:') throw invalid();
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  let owner, repo, ref = null, path = [];
  if (url.hostname === 'github.com') {
    [owner, repo] = parts;
    if (parts.length > 2) {
      if (!['tree', 'blob'].includes(parts[2]) || !parts[3]) throw invalid();
      ref = parts[3];
      path = parts.slice(4);
    }
  } else if (url.hostname === 'raw.githubusercontent.com') {
    [owner, repo, ref, ...path] = parts;
    if (!ref) throw invalid();
  } else {
    throw invalid();
  }
  repo = repo?.replace(/\.git$/, '');
  if (!NAME.test(owner ?? '') || !NAME.test(repo ?? '') || (ref !== null && !/^[A-Za-z0-9_.\-/]{1,200}$/.test(ref))) throw invalid();
  if (path.at(-1)?.toLowerCase() === 'skill.md') path = path.slice(0, -1);
  return { owner, repo, ref, path: path.join('/') };
}

const safeRel = rel => rel && !rel.includes('\\') && !rel.includes(':') && rel.split('/').every(s => s && s !== '.' && s !== '..');

// Shows what an update changes against the installed copy; source.json is the room's own record, not part of the skill.
function diffAgainst(dataDir, id, filesDir) {
  const result = spawnSync('git', ['diff', '--no-index', '--no-color', '--', `skills/${id}`, filesDir], { cwd: dataDir, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 && result.status !== 1) throw roomError('SKILL_DIFF_FAILED', result.stderr || String(result.error ?? ''));
  return result.stdout.split(/(?=^diff --git )/m).filter(block => !/^diff --git \S*source\.json /.test(block)).join('').slice(0, 100_000);
}

// The gh CLI's login, when there is one, lifts GitHub's limit from 60 to 5,000 requests an hour.
// The token stays in memory and is sent only to api.github.com.
export function ghToken(gh = { command: 'gh', prefixArgs: [] }) {
  const result = spawnSync(gh.command, [...gh.prefixArgs, 'auth', 'token'], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  const token = result.status === 0 ? result.stdout.trim() : '';
  return /^[A-Za-z0-9_]{20,255}$/.test(token) ? token : null;
}

function failure(target, res) {
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = new Date(Number(res.headers.get('x-ratelimit-reset')) * 1000);
    const until = Number.isNaN(reset.getTime()) ? 'later' : reset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return roomError('SKILL_FETCH_FAILED', `GitHub's request limit is used up until ${until}. Sign in with "gh auth login" to raise it.`);
  }
  return roomError('SKILL_FETCH_FAILED', `${target} answered ${res.status}`);
}

// id: what to install it as (a role set's own id); otherwise the folder's name.
export async function stageSkill(dataDir, url, { fetchImpl = globalThis.fetch, update = null, token: githubToken = null, id = null } = {}) {
  const src = parseGithubUrl(url);
  if (id !== null && !skillId(id)) throw roomError('SKILL_ID_INVALID', String(id));
  if (update !== null && (!skillId(update) || !existsSync(join(dataDir, 'skills', update, 'SKILL.md')))) throw roomError('SKILL_NOT_FOUND', String(update));
  const get = async (target, kind = 'json') => {
    const auth = githubToken && new URL(target).hostname === 'api.github.com' ? { authorization: `Bearer ${githubToken}` } : {};
    const res = await fetchImpl(target, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ascend-agent-room', ...auth }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw failure(target, res);
    return kind === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
  };
  const api = path => get(`https://api.github.com/repos/${src.owner}/${src.repo}${path}`);
  const ref = src.ref ?? (await api('')).default_branch;
  const commit = (await api(`/commits/${encodeURIComponent(ref)}`)).sha;
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw roomError('SKILL_FETCH_FAILED', `no commit for ${ref}`);
  const tree = await api(`/git/trees/${commit}?recursive=1`);
  // Links (mode 120000) and submodules are never fetched.
  const blobs = (tree.tree ?? []).filter(t => t.type === 'blob' && t.mode !== '120000');
  const prefix = src.path ? `${src.path}/` : '';
  if (!blobs.some(b => b.path === `${prefix}SKILL.md`)) {
    const found = blobs.filter(b => posix.basename(b.path) === 'SKILL.md' && b.path.startsWith(prefix)).map(b => posix.dirname(b.path));
    if (!found.length) throw roomError('SKILL_NOT_FOUND', `No SKILL.md in ${url}`);
    throw Object.assign(roomError('SKILL_PICK', `This link holds ${found.length} skills; pick one.`), {
      candidates: found.map(dir => `https://github.com/${src.owner}/${src.repo}/tree/${ref}/${dir}`),
    });
  }
  const files = blobs.filter(b => b.path.startsWith(prefix)).map(b => ({ rel: b.path.slice(prefix.length), size: b.size ?? 0 }));
  if (files.length > MAX_FILES || files.some(f => f.size > MAX_FILE_BYTES) || files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) {
    throw roomError('SKILL_TOO_LARGE', `A skill may have at most ${MAX_FILES} files, ${MAX_FILE_BYTES / 1000} kB each and ${MAX_TOTAL_BYTES / 1_000_000} MB in all.`);
  }
  if (!files.every(f => safeRel(f.rel))) throw roomError('SKILL_PATH_INVALID');

  const token = randomBytes(8).toString('hex');
  const stage = join(dataDir, 'skills-staging', token);
  const filesDir = join(stage, 'files');
  try {
    let total = 0;
    for (const f of files) {
      const raw = `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${commit}/${`${prefix}${f.rel}`.split('/').map(encodeURIComponent).join('/')}`;
      const data = await get(raw, 'bytes');
      total += data.length;
      if (data.length > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) throw roomError('SKILL_TOO_LARGE');
      mkdirSync(join(filesDir, posix.dirname(f.rel)), { recursive: true });
      writeFileSync(join(filesDir, f.rel), data);
    }
    const license = await api('/license').then(j => j.license?.spdx_id ?? null, () => null);
    const skillMd = readFileSync(join(filesDir, 'SKILL.md'), 'utf8');
    const { name, description } = frontMatter(skillMd);
    const base = (src.path ? posix.basename(src.path) : src.repo).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    const meta = {
      id: update ?? id ?? (base || 'skill'), name: name || base, description, url, owner: src.owner, repo: src.repo, path: src.path, commit, license,
      hasScripts: hasScriptFiles(files.map(f => f.rel)), files: files.map(f => f.rel), update,
    };
    writeJsonAtomic(join(stage, 'meta.json'), meta);
    return { token, ...meta, skillMd: skillMd.slice(0, 100_000), diff: update ? diffAgainst(dataDir, update, `skills-staging/${token}/files`) : null };
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
