import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { validatePlan, validateRoles } from '../../scripts/agent-room/parse.mjs';
import { buildPrompt } from '../../scripts/agent-room/prompts.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { activeRoleSets, skillIndex, writeRoleSets } from '../../scripts/agent-room/skills.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

function addSkill(dataDir, id, description) {
  const dir = join(dataDir, 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: ${description}\n---\n\n# ${id}\n`, 'utf8');
  return dir;
}

const FRONTEND = { id: 'frontend', name: 'Frontend', prompt: 'You build the interface.', skills: [
  { id: 'react-best-practices', name: 'Vercel React best practices', description: 'React performance rules.' },
  { id: 'magic-ui', name: 'Magic UI', description: 'Animated components.' },
] };

test('roles may say which agents wear which enabled sets; anything else is dropped', () => {
  const checked = validateRoles({ orchestrator: 'codex', coders: ['claude'], reviewer: null, wear: { claude: ['frontend', 'nope'], agy: 'x', bob: ['frontend'] } }, ['frontend']);
  assert.deepEqual(checked.value.wear, { claude: ['frontend'] });
  assert.equal(validateRoles({ orchestrator: 'codex', coders: ['claude'] }, ['frontend']).value.wear, undefined);
});

test('a plan task may carry the role of an enabled set, and only such a role', () => {
  const plan = { tasks: [{ title: 'UI', assignee: 'claude', description: 'd', role: 'frontend' }, { title: 'Docs', assignee: 'claude', description: 'd' }] };
  const ok = validatePlan(plan, ['claude'], ['frontend']);
  assert.equal(ok.value.tasks[0].role, 'frontend');
  assert.equal('role' in ok.value.tasks[1], false);
  assert.match(validatePlan(plan, ['claude'], []).error, /role/);
  assert.equal(validatePlan({ tasks: [{ ...plan.tasks[0], role: null }] }, ['claude'], []).ok, true, 'null means no role');
});

test('the coder of a task with a role gets that role and a short skill index, after the task and before the room rules', () => {
  const task = { id: 1, title: 'UI', description: 'Build the page.', role: 'frontend' };
  const prompt = buildPrompt({ stage: 'build', agent: 'claude', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, task: 't', extra: { task }, roleSets: [FRONTEND] });
  assert.match(prompt, /ROLE: Frontend\. You build the interface\./);
  assert.match(prompt, /- Vercel React best practices: React performance rules\. \(\.ascend\/skills\/react-best-practices\/SKILL\.md\)/);
  assert.ok(prompt.indexOf('Build the page.') < prompt.indexOf('ROLE: Frontend'));
  assert.ok(prompt.indexOf('ROLE: Frontend') < prompt.indexOf('Work only inside the current folder'));
  const plain = buildPrompt({ stage: 'build', agent: 'claude', roles: null, task: 't', extra: { task: { ...task, role: undefined } }, roleSets: [FRONTEND] });
  assert.equal(plain.includes('ROLE:'), false);
});

test('the skill index stays near 1,500 characters however many skills a set has', () => {
  const many = { ...FRONTEND, skills: Array.from({ length: 60 }, (_, i) => ({ id: `skill-${i}`, name: `Skill ${i}`, description: 'x'.repeat(150) })) };
  assert.ok(skillIndex(many).length <= 1600);
  assert.match(skillIndex(many), /more skills in \.ascend\/skills/);
});

test('the plan prompt lists the enabled sets and who wears them', () => {
  const roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null, wear: { claude: ['frontend'] } };
  const prompt = buildPrompt({ stage: 'plan', agent: 'codex', roles, task: 't', roleSets: [FRONTEND] });
  assert.match(prompt, /frontend \(Frontend\): You build the interface\. Worn by: Claude/);
  assert.match(prompt, /"role"/);
  assert.equal(buildPrompt({ stage: 'plan', agent: 'codex', roles, task: 't', roleSets: [] }).includes('"role"'), false);
});

const ls = dir => spawnSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n');

test('a session copies the enabled skills into .ascend/skills, keeps them out of git and sends them to the coder', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  addSkill(dataDir, 'react-best-practices', 'React performance rules.');
  addSkill(dataDir, 'impeccable', 'Design polish.');
  writeRoleSets(dataDir, { sets: { frontend: { on: true, skills: { 'magic-ui': false } } } });
  assert.deepEqual(activeRoleSets(dataDir).map(s => [s.id, s.skills.map(k => k.id)]), [['frontend', ['react-best-practices']]]);

  const calls = [];
  const respond = ({ stage }) => ({
    plan: { text: json({ tasks: [{ title: 'Page', assignee: 'claude', description: 'd', role: 'frontend' }, { title: 'Readme', assignee: 'claude', description: 'r' }] }) },
    build: { text: 'ok', files: { [`f${calls.filter(c => c.stage === 'build').length}.txt`]: 'x' } },
    finish: { text: '# Done' },
  })[stage];
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) },
    { project: 'skill-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  const dir = session.state.projectDir;
  assert.deepEqual(session.state.roleSets.map(s => s.id), ['frontend']);
  assert.ok(existsSync(join(dir, '.ascend', 'skills', 'react-best-practices', 'SKILL.md')));
  assert.equal(existsSync(join(dir, '.ascend', 'skills', 'impeccable')), false, 'only skills of enabled sets');
  assert.match(readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8'), /^\.ascend\/$/m);

  // The owner turning a set off later does not change a running session.
  writeRoleSets(dataDir, { sets: { frontend: { on: false } } });
  await session.kick();
  assert.equal(session.state.plan.tasks[0].role, 'frontend');
  await session.gate({ gate: 'plan', decision: 'approve' });
  const builds = calls.filter(c => c.stage === 'build');
  assert.match(builds[0].prompt, /\.ascend\/skills\/react-best-practices\/SKILL\.md/);
  assert.equal(builds[1].prompt.includes('.ascend/skills'), false, 'a task without a role gets no index');
  assert.ok(ls(dir).every(f => !f.startsWith('.ascend')), 'the skills are never committed');
  assert.ok(existsSync(join(dir, '.ascend', 'skills', 'react-best-practices', 'SKILL.md')), 'rollbacks keep them');
});

test('with no set on, a session has no .ascend folder and no role rules', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  addSkill(dataDir, 'react-best-practices', 'React performance rules.');
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })) },
    { project: 'plain-app', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  assert.deepEqual(session.state.roleSets, []);
  assert.equal(existsSync(join(session.state.projectDir, '.ascend')), false);
});

test('in a repo session the skills go into the worktree, the exclude into the repo, and a merge carries none of them', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  addSkill(dataDir, 'code-review', 'Find bugs.');
  writeRoleSets(dataDir, { sets: { 'code-reviewer': { on: true } } });
  const repo = join(dataDir, '..', 'myrepo');
  mkdirSync(repo, { recursive: true });
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'app.js'), 'hello\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  const respond = ({ stage }) => ({
    plan: { text: json({ tasks: [{ title: 'Edit', assignee: 'claude', description: 'd', role: 'code-reviewer' }] }) },
    build: { text: 'ok', files: { 'app.js': 'good\n' } },
    finish: { text: '# Done' },
  })[stage];
  const session = RoomSession.create({ dataDir, settings: { ...testSettings(buildsRoot), debateFolders: [repo] }, runTurn: fakeRunTurn(respond) },
    { project: 'rev', task: 't', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null }, repo });
  assert.ok(existsSync(join(session.state.projectDir, '.ascend', 'skills', 'code-review', 'SKILL.md')));
  assert.match(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8'), /^\.ascend\/$/m);
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  await session.gate({ gate: 'result', decision: 'merge' });
  assert.equal(session.state.stage, 'done');
  assert.deepEqual(git('ls-files').stdout.trim().split('\n'), ['app.js']);
  assert.equal(readFileSync(join(repo, 'app.js'), 'utf8'), 'good\n');
});
