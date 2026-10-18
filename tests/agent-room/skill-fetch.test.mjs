import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseGithubUrl, stageSkill } from '../../scripts/agent-room/github.mjs';
import { startRoomServer } from '../../scripts/agent-room/server.mjs';
import { discardStaged, installStaged, listSkills, readRoleSets, removeSkill, viewSkill } from '../../scripts/agent-room/skills.mjs';
import { tempRoom, testSettings } from './helpers.mjs';

const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const md = (name, extra = '') => `---\nname: ${name}\ndescription: Rules for ${name}.\n---\n\n# ${name}\n${extra}`;

// A tiny GitHub: repos maps "owner/repo" to { branch, commits: { sha: { path: text } }, license }.
function fakeGithub(repos) {
  const calls = [];
  const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const fetchImpl = async url => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      const [, , owner, name, kind, ...rest] = u.pathname.split('/');
      const repo = repos[`${owner}/${name}`];
      if (!repo) return reply(404, { message: 'Not Found' });
      if (!kind) return reply(200, { default_branch: repo.branch });
      if (kind === 'commits') return reply(200, { sha: repo.head });
      if (kind === 'license') return repo.license ? reply(200, { license: { spdx_id: repo.license } }) : reply(404, {});
      if (kind === 'git' && rest[0] === 'trees') {
        const files = repo.commits[rest[1]];
        return reply(200, { truncated: false, tree: Object.keys(files).map(path => ({ path, type: 'blob', mode: path.endsWith('.lnk') ? '120000' : '100644', size: files[path].length })) });
      }
    }
    if (u.hostname === 'raw.githubusercontent.com') {
      const [, owner, name, sha, ...path] = u.pathname.split('/');
      const text = repos[`${owner}/${name}`]?.commits[sha]?.[decodeURIComponent(path.join('/'))];
      return text === undefined ? reply(404, '') : reply(200, text);
    }
    return reply(404, '');
  };
  return { fetchImpl, calls };
}

const SKILLS_REPO = {
  branch: 'main', head: SHA, license: 'MIT',
  commits: {
    [SHA]: {
      'README.md': '# many skills',
      'skills/code-review/SKILL.md': md('code-review'),
      'skills/code-review/references/checklist.md': '- check things',
      'skills/static-analysis/SKILL.md': md('static-analysis'),
      'skills/static-analysis/scripts/run.sh': 'semgrep .',
      'skills/static-analysis/evil.lnk': '../../outside',
    },
    [SHA2]: {
      'skills/code-review/SKILL.md': md('code-review', 'New rule.\n'),
      'skills/code-review/references/checklist.md': '- check things',
    },
  },
};

test('GitHub links name a repo, an optional ref and an optional folder', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/getsentry/skills'), { owner: 'getsentry', repo: 'skills', ref: null, path: '' });
  assert.deepEqual(parseGithubUrl('https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices/'), { owner: 'vercel-labs', repo: 'agent-skills', ref: 'main', path: 'skills/react-best-practices' });
  assert.deepEqual(parseGithubUrl('https://github.com/magicuidesign/magicui/blob/main/skills/magic-ui/SKILL.md'), { owner: 'magicuidesign', repo: 'magicui', ref: 'main', path: 'skills/magic-ui' });
  assert.deepEqual(parseGithubUrl('https://raw.githubusercontent.com/o/r/main/x/SKILL.md'), { owner: 'o', repo: 'r', ref: 'main', path: 'x' });
  assert.deepEqual(parseGithubUrl('https://github.com/o/r.git'), { owner: 'o', repo: 'r', ref: null, path: '' });
  for (const bad of ['https://gitlab.com/o/r', 'http://github.com/o/r', 'https://github.com/o', 'https://github.com/o/r/tree/main/../x', 'nope']) {
    assert.throws(() => parseGithubUrl(bad), /SKILL_URL_INVALID/, bad);
  }
});

test('a repo with several skills and no folder lists them instead of guessing', async () => {
  const { dataDir } = tempRoom();
  const gh = fakeGithub({ 'getsentry/skills': SKILLS_REPO });
  await assert.rejects(stageSkill(dataDir, 'https://github.com/getsentry/skills', { fetchImpl: gh.fetchImpl }),
    err => err.code === 'SKILL_PICK' && err.candidates.join() === 'https://github.com/getsentry/skills/tree/main/skills/code-review,https://github.com/getsentry/skills/tree/main/skills/static-analysis');
});

test('fetching stages the folder at a pinned commit with its license; nothing is installed until the owner says so', async () => {
  const { dataDir } = tempRoom();
  const gh = fakeGithub({ 'getsentry/skills': SKILLS_REPO });
  const staged = await stageSkill(dataDir, 'https://github.com/getsentry/skills/tree/main/skills/static-analysis', { fetchImpl: gh.fetchImpl });
  assert.equal(staged.id, 'static-analysis');
  assert.equal(staged.commit, SHA);
  assert.equal(staged.license, 'MIT');
  assert.equal(staged.hasScripts, true);
  assert.deepEqual(staged.files, ['SKILL.md', 'scripts/run.sh'], 'links are skipped');
  assert.match(staged.skillMd, /# static-analysis/);
  assert.equal(staged.diff, null);
  assert.ok(gh.calls.every(u => /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//.test(u)));
  assert.ok(gh.calls.filter(u => u.includes('raw.githubusercontent.com')).every(u => u.includes(`/${SHA}/`)), 'files come from the pinned commit');
  assert.deepEqual(listSkills(dataDir), []);

  const installed = installStaged(dataDir, staged.token);
  assert.equal(installed.id, 'static-analysis');
  const [skill] = listSkills(dataDir);
  assert.deepEqual(skill.source, { url: 'https://github.com/getsentry/skills/tree/main/skills/static-analysis', owner: 'getsentry', repo: 'skills', path: 'skills/static-analysis', commit: SHA, license: 'MIT', fetchedAt: skill.source.fetchedAt });
  assert.ok(readRoleSets(dataDir).find(s => s.id === 'security').skills.find(k => k.id === 'static-analysis').installed);
  assert.match(viewSkill(dataDir, 'static-analysis'), /# static-analysis/);
  assert.throws(() => installStaged(dataDir, staged.token), /SKILL_STAGE_MISSING/, 'a stage is used once');
});

test('the owner may install under another id, and discard a stage instead', async () => {
  const { dataDir } = tempRoom();
  const gh = fakeGithub({ 'getsentry/skills': SKILLS_REPO });
  const url = 'https://github.com/getsentry/skills/tree/main/skills/code-review';
  const staged = await stageSkill(dataDir, url, { fetchImpl: gh.fetchImpl });
  assert.throws(() => installStaged(dataDir, staged.token, '../x'), /SKILL_ID_INVALID/);
  installStaged(dataDir, staged.token, 'sentry-review');
  assert.deepEqual(listSkills(dataDir).map(s => s.id), ['sentry-review']);
  const again = await stageSkill(dataDir, url, { fetchImpl: gh.fetchImpl });
  discardStaged(dataDir, again.token);
  assert.equal(existsSync(join(dataDir, 'skills-staging', again.token)), false);
  removeSkill(dataDir, 'sentry-review');
  assert.deepEqual(listSkills(dataDir), []);
});

test('an update is fetched again, shown as a diff against the installed copy, and replaces it only on install', async () => {
  const { dataDir } = tempRoom();
  const repos = { 'getsentry/skills': { ...SKILLS_REPO } };
  const gh = fakeGithub(repos);
  const url = 'https://github.com/getsentry/skills/tree/main/skills/code-review';
  installStaged(dataDir, (await stageSkill(dataDir, url, { fetchImpl: gh.fetchImpl })).token);
  repos['getsentry/skills'].head = SHA2;
  const update = await stageSkill(dataDir, url, { fetchImpl: gh.fetchImpl, update: 'code-review' });
  assert.equal(update.commit, SHA2);
  assert.match(update.diff, /\+New rule\./);
  assert.equal(viewSkill(dataDir, 'code-review').includes('New rule.'), false, 'not replaced yet');
  installStaged(dataDir, update.token);
  assert.match(viewSkill(dataDir, 'code-review'), /New rule\./);
  assert.equal(listSkills(dataDir)[0].source.commit, SHA2);
  const same = await stageSkill(dataDir, url, { fetchImpl: gh.fetchImpl, update: 'code-review' });
  assert.equal(same.diff, '', 'no changes since the installed commit');
});

test('missing repos, oversized skills and paths outside the folder are refused', async () => {
  const { dataDir } = tempRoom();
  const big = { branch: 'main', head: SHA, commits: { [SHA]: { 'SKILL.md': md('big'), 'huge.md': 'x'.repeat(2_100_000) } } };
  const gh = fakeGithub({ 'o/big': big });
  await assert.rejects(stageSkill(dataDir, 'https://github.com/o/missing', { fetchImpl: gh.fetchImpl }), /SKILL_FETCH_FAILED/);
  await assert.rejects(stageSkill(dataDir, 'https://github.com/o/big', { fetchImpl: gh.fetchImpl }), /SKILL_TOO_LARGE/);
  const none = fakeGithub({ 'o/none': { branch: 'main', head: SHA, commits: { [SHA]: { 'README.md': 'x' } } } });
  await assert.rejects(stageSkill(dataDir, 'https://github.com/o/none', { fetchImpl: none.fetchImpl }), /SKILL_NOT_FOUND/);
});

test('the room server fetches, installs, views and removes skills', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const gh = fakeGithub({ 'getsentry/skills': SKILLS_REPO });
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), probe: async () => ({ state: 'ready' }), port: 0, fetchImpl: gh.fetchImpl });
  const call = (method, path, body) => fetch(`http://127.0.0.1:${room.port}${path}`, {
    method, headers: { authorization: `Bearer ${room.token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }));
  try {
    const pick = await call('POST', '/skills/fetch', { url: 'https://github.com/getsentry/skills' });
    assert.equal(pick.status, 409);
    assert.equal(pick.body.candidates.length, 2);
    const staged = await call('POST', '/skills/fetch', { url: pick.body.candidates[0] });
    assert.equal(staged.body.staged.id, 'code-review');
    assert.equal((await call('POST', '/skills/install', { token: staged.body.staged.token })).status, 200);
    const list = await call('GET', '/skills');
    assert.deepEqual(list.body.skills.map(s => s.id), ['code-review']);
    assert.match((await call('GET', '/skills/view?id=code-review')).body.text, /# code-review/);
    assert.equal((await call('POST', '/skills/remove', { id: 'code-review' })).status, 200);
    assert.deepEqual((await call('GET', '/skills')).body.skills, []);
    assert.equal((await call('POST', '/skills/install', { token: 'nope' })).status, 400);
  } finally {
    await room.close();
  }
});

test('a gh login token goes to api.github.com only, and a used-up limit says when it resets', async () => {
  const { dataDir } = tempRoom();
  const gh = fakeGithub({ 'getsentry/skills': SKILLS_REPO });
  const seen = [];
  const fetchImpl = (url, init) => { seen.push([new URL(url).hostname, init?.headers?.authorization ?? null]); return gh.fetchImpl(url, init); };
  await stageSkill(dataDir, 'https://github.com/getsentry/skills/tree/main/skills/code-review', { fetchImpl, token: 'gho_abc' });
  assert.ok(seen.filter(([host]) => host === 'api.github.com').every(([, auth]) => auth === 'Bearer gho_abc'));
  assert.ok(seen.filter(([host]) => host === 'raw.githubusercontent.com').every(([, auth]) => auth === null));

  const limited = async () => new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792202638' } });
  await assert.rejects(stageSkill(dataDir, 'https://github.com/getsentry/skills', { fetchImpl: limited }),
    err => err.code === 'SKILL_FETCH_FAILED' && /request limit is used up until/.test(err.message) && /gh auth login/.test(err.message));
});

test('a fetch may name the id it installs under, so a role set skill lands on its own id', async () => {
  const { dataDir } = tempRoom();
  const gh = fakeGithub({ 'getsentry/skills': SKILLS_REPO });
  const staged = await stageSkill(dataDir, 'https://github.com/getsentry/skills/tree/main/skills/static-analysis', { fetchImpl: gh.fetchImpl, id: 'semgrep-rules' });
  assert.equal(staged.id, 'semgrep-rules');
  await assert.rejects(stageSkill(dataDir, 'https://github.com/getsentry/skills/tree/main/skills/static-analysis', { fetchImpl: gh.fetchImpl, id: 'Bad Id' }), /SKILL_ID_INVALID/);
});
