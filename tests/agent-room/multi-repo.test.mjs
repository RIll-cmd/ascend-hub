import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildInvocation } from '../../scripts/agent-room/agents.mjs';
import { validatePlan } from '../../scripts/agent-room/parse.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: 'agy' };

function makeRepo(root, name, file, text, pkgTest) {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, file), text);
  if (pkgTest) writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { test: pkgTest } }));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function setup(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const root = join(dataDir, '..', 'repos');
  const api = makeRepo(root, 'api', 'server.js', 'old api\n');
  const web = makeRepo(root, 'web', 'page.js', 'old page\n', 'node -e "process.exit(require(\'fs\').readFileSync(\'page.js\',\'utf8\').includes(\'new\') ? 0 : 1)"');
  const calls = [];
  const settings = { ...testSettings(buildsRoot), debateFolders: [api, web] };
  return { api, web, calls, opts: { dataDir, settings, runTurn: fakeRunTurn(respond, calls) } };
}

const PLAN = { tasks: [
  { title: 'API change', assignee: 'claude', description: 'Change server.js', repo: 'api' },
  { title: 'Page change', assignee: 'claude', description: 'Change page.js', repo: 'web' },
] };

function respondWith({ race = false } = {}) {
  return ({ stage, cwd }) => {
    if (stage === 'plan') return { text: json(race ? { tasks: PLAN.tasks.map(t => ({ ...t, race: true })) } : PLAN) };
    if (stage === 'build') return cwd.includes('web-') ? { text: 'ok', files: { 'page.js': 'new page\n' } } : { text: 'ok', files: { 'server.js': 'new api\n' } };
    if (stage === 'review') return { text: json({ verdict: 'ok' }) };
    return { text: '# Done' };
  };
}

test('a plan names each task\'s repo; an unknown repo is refused, the main one is left implicit, and races are off', () => {
  const ok = validatePlan({ tasks: [{ title: 'a', assignee: 'claude', description: '', repo: 'web' }, { title: 'b', assignee: 'claude', description: '', repo: 'api', race: true }] }, ['claude', 'codex'], [], ['api', 'web']);
  assert.equal(ok.value.tasks[0].repo, 'web');
  assert.equal(ok.value.tasks[1].repo, undefined, 'the main repo is the default');
  assert.equal(ok.value.tasks[1].race, undefined, 'several repos never race');
  assert.match(validatePlan({ tasks: [{ title: 'a', assignee: 'claude', description: '', repo: 'docs' }] }, ['claude'], [], ['api', 'web']).error, /repo must be one of: api, web/);
  assert.equal(validatePlan({ tasks: [{ title: 'a', assignee: 'claude', description: '', repo: 'x' }] }, ['claude']).value.tasks[0].repo, undefined, 'one repo ignores the field');
});

test('extra repos need a main repo, distinct folder names and at most three', () => {
  const { api, web, opts } = setup(() => ({ text: '' }));
  assert.throws(() => RoomSession.create(opts, { project: 'p', task: 't', roles: ROLES, extraRepos: [web] }), /EXTRA_REPOS_NEED_REPO/);
  assert.throws(() => RoomSession.create(opts, { project: 'p', task: 't', roles: ROLES, repo: api, extraRepos: [api] }), /EXTRA_REPOS_INVALID/);
  assert.throws(() => RoomSession.create(opts, { project: 'p', task: 't', roles: ROLES, repo: api, extraRepos: [web, web, web, web] }), /EXTRA_REPOS_INVALID/);
  assert.throws(() => RoomSession.create(opts, { project: 'p', task: 't', roles: ROLES, repo: api, extraRepos: ['C:\\Windows'] }), /REPO_INVALID/);
});

test('each task edits, commits and checks in its own repo\'s worktree, and read turns may look at every worktree', async () => {
  const { api, web, calls, opts } = setup(respondWith({ race: true }));
  const session = RoomSession.create(opts, { project: 'both', task: 't', roles: ROLES, repo: api, extraRepos: [web], parallel: true });
  const { projectDir, extraRepos } = session.state;
  assert.equal(session.state.parallel, false, 'several repos run one task at a time');
  assert.equal(extraRepos[0].id, 'web');
  assert.match(extraRepos[0].branch, /^room\/both-[0-9a-f]{6}$/);
  assert.equal(git(extraRepos[0].worktree, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), extraRepos[0].branch);
  assert.equal(extraRepos[0].check, 'npm test', 'the extra repo has its own check');
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(session.state.stage, 'gate-result');
  const [apiTask, webTask] = session.state.plan.tasks;
  assert.equal(apiTask.repo, undefined);
  assert.equal(webTask.repo, 'web');
  assert.ok(!apiTask.race && !webTask.race);
  const builds = calls.filter(c => c.stage === 'build');
  assert.deepEqual(builds.map(c => c.cwd), [projectDir, extraRepos[0].worktree]);
  assert.equal(git(extraRepos[0].worktree, 'log', '-1', '--format=%s').stdout.trim(), 'task-2: Page change');
  assert.equal(webTask.check.ok, true, 'npm test ran in the web worktree');
  assert.equal(apiTask.check, undefined, 'the main repo has no check command here');
  assert.match(calls.find(c => c.stage === 'plan').prompt, /REPOSITORIES in this session[^\n]*\n- api: [^\n]+\n- web: /);
  const review = calls.find(c => c.stage === 'review' && c.cwd === extraRepos[0].worktree);
  assert.ok(review, 'the web task is reviewed in its own worktree');
  const plan = calls.find(c => c.stage === 'plan');
  assert.equal(plan.args.indexOf('--add-dir'), -1, 'Codex reads everything already');
  const claudeRead = buildInvocation('claude', 'read', 'p', { cwd: projectDir, settings: opts.settings, addDirs: [extraRepos[0].worktree] }).args;
  assert.deepEqual(claudeRead.slice(-2), ['--add-dir', extraRepos[0].worktree]);
  assert.ok(buildInvocation('agy', 'read', 'p', { cwd: projectDir, settings: opts.settings, addDirs: ['W'] }).args.includes('--add-dir=W'));
  assert.match(session.diff('all').text, /^# api \(room\/both-[0-9a-f]{6}\)\n[\s\S]*new api[\s\S]*\n\n# web \(room\/both-[0-9a-f]{6}\)\n[\s\S]*new page/);
  assert.match(session.diff(webTask.commit).text, /new page/);
});

test('merging at the result gate merges every repo, and a refused merge leaves the gate open to answer again', async () => {
  const { api, web, opts } = setup(respondWith());
  const session = RoomSession.create(opts, { project: 'both', task: 't', roles: ROLES, repo: api, extraRepos: [web] });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  // The main repo's checkout is on another branch meanwhile, so its merge is refused after web merged.
  git(api, 'checkout', '-q', '-b', 'elsewhere');
  await assert.rejects(async () => session.gate({ gate: 'result', decision: 'merge' }), /MERGE_REFUSED: The repo is on elsewhere/);
  assert.equal(session.state.stage, 'gate-result');
  assert.equal(session.state.extraRepos[0].finished, 'merge');
  assert.equal(readFileSync(join(web, 'page.js'), 'utf8'), 'new page\n', 'web was merged');
  git(api, 'checkout', '-q', 'main');
  await session.gate({ gate: 'result', decision: 'merge' });
  assert.equal(session.state.stage, 'done');
  assert.equal(readFileSync(join(api, 'server.js'), 'utf8'), 'new api\n');
  assert.equal(session.transcript.filter(m => /Merged .* into main in web/.test(m.text)).length, 1, 'web is not merged twice');
});

test('rejecting deletes every branch, and a rewind resets each repo to where its task began', async () => {
  const { api, web, opts } = setup(respondWith());
  const session = RoomSession.create(opts, { project: 'both', task: 't', roles: ROLES, repo: api, extraRepos: [web] });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  const worktree = session.state.extraRepos[0].worktree;
  const webStart = session.state.plan.tasks[1].before;
  const kick = session.kick;
  session.kick = async () => {};
  session.rewind({ to: 'task', task: 1 });
  session.kick = kick;
  assert.equal(git(worktree, 'rev-parse', '--short', 'HEAD').stdout.trim(), webStart);
  assert.equal(git(session.state.projectDir, 'log', '-1', '--format=%s').stdout.trim(), 'init');
  assert.ok(session.state.plan.tasks.every(t => t.status === 'pending'));
  await session.kick();
  await session.gate({ gate: 'result', decision: 'reject' });
  assert.equal(session.state.stage, 'rejected');
  assert.equal(git(web, 'branch', '--list', 'room/*').stdout.trim(), '', 'the web branch is gone');
  assert.equal(git(api, 'branch', '--list', 'room/*').stdout.trim(), '', 'the api branch is gone');
});
