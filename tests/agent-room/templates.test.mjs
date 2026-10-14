import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInvocation } from '../../scripts/agent-room/agents.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const pass = 'node -e "process.exit(0)"';
const failUnlessFixed = 'node -e "process.exit(require(\'fs\').existsSync(\'fix.txt\') ? 0 : 1)"';

function make(body, respond = () => ({ text: 'x' })) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) }, { project: 'app', task: 't', roles: ROLES, ...body });
  return { session, calls };
}

test('Claude takes a model flag only when one is chosen', () => {
  const settings = testSettings('x');
  const plain = buildInvocation('claude', 'read', 'hi', { cwd: '.', settings, outFile: null });
  assert.equal(plain.args.includes('--model'), false);
  const chosen = buildInvocation('claude', 'read', 'hi', { cwd: '.', settings: { ...settings, agents: { ...settings.agents, claude: { ...settings.agents.claude, model: 'sonnet' } } }, outFile: null });
  assert.deepEqual(chosen.args.slice(chosen.args.indexOf('--model'), chosen.args.indexOf('--model') + 2), ['--model', 'sonnet']);
});

test('a session can pick a model per agent; bad names and unknown templates are refused', async () => {
  const { session, calls } = make({ models: { codex: 'gpt-6-mini', claude: 'haiku' } }, ({ stage }) => ({ text: json({ tasks: [{ title: 'a', assignee: 'claude', description: '' }] }) }));
  await session.kick();
  assert.deepEqual(calls[0].args.slice(calls[0].args.indexOf('-m'), calls[0].args.indexOf('-m') + 2), ['-m', 'gpt-6-mini']);
  assert.throws(() => make({ models: { claude: 'rm -rf /' } }), /MODELS_INVALID/);
  assert.throws(() => make({ models: { agy: 'x' } }), /MODELS_INVALID/);
  assert.throws(() => make({ template: 'yolo' }), /TEMPLATE_INVALID/);
  assert.throws(() => make({ template: 'bugfix' }), /CHECK_REQUIRED/);
  assert.throws(() => make({ template: 'refactor' }), /CHECK_REQUIRED/);
});

const PLAN = { tasks: [{ title: 'Reproduce', assignee: 'claude', description: 'test' }, { title: 'Fix', assignee: 'claude', description: 'fix' }] };

test('bug fix: task 1 must add a test that fails; once it does, the fix must make the checks pass', async () => {
  let builds = 0;
  const { session, calls } = make({ template: 'bugfix', check: failUnlessFixed }, ({ stage, prompt }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') {
      builds += 1;
      // First try at task 1 "fixes" too early, so the checks already pass.
      if (/task 1/.test(prompt)) return { text: 'test', files: builds === 1 ? { 'fix.txt': 'x', 't1.txt': 'a' } : { 't1b.txt': 'b' } };
      return { text: 'fixed', files: { 'fix.txt': 'x' } };
    }
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  });
  await session.kick();
  assert.match(calls[0].prompt, /Task 1 must only add an automated test that reproduces the bug/);
  await session.gate({ gate: 'plan', decision: 'approve' });
  const [one, two] = session.state.plan.tasks;
  assert.ok(session.transcript.some(m => /already pass, so the new test does not reproduce the bug/.test(m.text)));
  assert.equal(one.status, 'done');
  assert.equal(one.check.ok, false, 'the reproducing test fails, as it must');
  assert.equal(two.status, 'done');
  assert.equal(two.check.ok, true);
});

test('refactor: checks run on the untouched code first, and prompts say behaviour must not change', async () => {
  const red = make({ template: 'refactor', check: 'node -e "process.exit(2)"' }, ({ stage }) => (stage === 'plan' ? { text: json({ tasks: [PLAN.tasks[1]] }) } : { text: 'x', files: { 'a.txt': 'a' } }));
  await red.session.kick();
  await red.session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(red.session.state.pause.kind, 'baseline');
  assert.match(red.session.state.pause.reason, /already fail before any change/);
  assert.equal(red.calls.filter(c => c.stage === 'build').length, 0);

  const green = make({ template: 'refactor', check: pass }, ({ stage }) => ({ plan: { text: json({ tasks: [PLAN.tasks[1]] }) }, build: { text: 'x', files: { 'a.txt': 'a' } }, finish: { text: 'Done.' } })[stage]);
  await green.session.kick();
  await green.session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(green.session.state.baseline.ok, true);
  assert.equal(green.session.state.stage, 'gate-result');
  assert.match(green.calls.find(c => c.stage === 'build').prompt, /Behaviour must not change/);
});
