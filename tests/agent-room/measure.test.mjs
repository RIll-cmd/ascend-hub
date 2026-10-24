import assert from 'node:assert/strict';
import test from 'node:test';
import { coveragePercent } from '../../scripts/agent-room/project.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };

test('coverage totals are read from c8/istanbul, the Node test runner and pytest-cov summaries', () => {
  const c8 = '----------|---------|----------|\nFile      | % Stmts | % Branch |\n----------|---------|----------|\nAll files |   84.21 |    70.5  |\n app.js   |   84.21 |    70.5  |';
  assert.equal(coveragePercent(c8), 84.21);
  const node = '# start of coverage report\n# ----------\n# file      | line % | branch % | funcs %\n# app.mjs   |  90.00 |   50.00  | 100.00\n# all files |  91.30 |   50.00  | 100.00\n# end of coverage report';
  assert.equal(coveragePercent(node), 91.3);
  // Node 24's default (spec) reporter, as a real run printed it.
  const spec = 'ℹ start of coverage report\nℹ file      | line % | branch % | funcs % | uncovered lines\nℹ sum.js    | 100.00 |   100.00 |  100.00 | \nℹ all files | 100.00 |   100.00 |  100.00 | \nℹ end of coverage report';
  assert.equal(coveragePercent(spec), 100);
  const pytest = 'Name      Stmts   Miss  Cover\n---------------------------\napp.py       10      2    80%\n---------------------------\nTOTAL        10      2    80%';
  assert.equal(coveragePercent(pytest), 80);
  assert.equal(coveragePercent('All files | 50\nlater run\nAll files | 75'), 75, 'the last report wins');
  assert.equal(coveragePercent('12 tests passed'), null);
  assert.equal(coveragePercent('All files | 140'), null);
});

function run({ lint, coverage, check = 'node -e "0"' }) {
  const { dataDir, buildsRoot } = tempRoom();
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'One', assignee: 'claude', description: 'd' }, { title: 'Two', assignee: 'claude', description: 'd' }] }) };
    if (stage === 'build') return { text: 'done', files: { [`f${Date.now()}${Math.random()}.txt`]: 'x' } };
    if (stage === 'finish') return { text: 'Done.' };
    throw new Error(stage);
  };
  return RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) }, { project: 'measure', task: 't', roles: ROLES, check, lint, coverage });
}

test('lint and coverage run after each task\'s checks, are kept on the task and in the Checks tab, and never block it', async () => {
  const s = run({
    lint: 'node -e "console.log(\'2 problems (1 error, 1 warning)\'); process.exit(1)"',
    coverage: 'node -e "console.log(\'All files |   72.5 |\')"',
  });
  await s.kick();
  await s.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(s.state.stage, 'gate-result');
  for (const task of s.state.plan.tasks) {
    assert.equal(task.status, 'done', 'a failing lint does not send the task back');
    assert.deepEqual({ ...task.lint, ms: 0 }, { ok: false, code: 1, ms: 0, summary: '2 problems (1 error, 1 warning)' });
    assert.equal(task.coverage.percent, 72.5);
  }
  assert.deepEqual(s.state.checkRuns.map(r => r.label), ['task 1', 'task 1 lint', 'task 1 coverage', 'task 2', 'task 2 lint', 'task 2 coverage']);
  assert.equal(s.state.checkRuns[1].command, s.state.lint);
  assert.ok(s.transcript.some(m => m.text === 'Task 1: lint failed (exit 1): 2 problems (1 error, 1 warning); coverage 72.5%.'));
});

test('without lint or coverage commands nothing extra runs, and a report without a total says so', async () => {
  const plain = run({});
  await plain.kick();
  await plain.gate({ gate: 'plan', decision: 'approve' });
  assert.deepEqual(plain.state.checkRuns.map(r => r.label), ['task 1', 'task 2']);
  assert.equal(plain.state.plan.tasks[0].lint, undefined);

  const noTotal = run({ coverage: 'node -e "console.log(\'no report\')"' });
  await noTotal.kick();
  await noTotal.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(noTotal.state.plan.tasks[0].coverage.percent, null);
  assert.ok(noTotal.transcript.some(m => m.text === 'Task 1: coverage not found in the output.'));
});

test('lint and coverage must be short strings', () => {
  assert.throws(() => run({ lint: 5 }), /LINT_INVALID/);
  assert.throws(() => run({ coverage: 'x'.repeat(501) }), /COVERAGE_INVALID/);
});
