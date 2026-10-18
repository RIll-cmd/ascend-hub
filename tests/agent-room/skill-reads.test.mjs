import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { skillReads } from '../../scripts/agent-room/events.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { activeRoleSets, writeRoleSets } from '../../scripts/agent-room/skills.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const claudeRead = path => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: path } }] } });
const codexCommand = command => ({ type: 'item.completed', item: { type: 'command_execution', command, aggregated_output: '' } });

test('skill reads come from tool calls and commands, never from what an agent merely says', () => {
  assert.deepEqual(skillReads('claude', claudeRead('C:\\builds\\app\\.ascend\\skills\\react-best-practices\\SKILL.md')), ['react-best-practices']);
  assert.deepEqual(skillReads('claude', claudeRead('.ascend/skills/magic-ui/references/a.md')), ['magic-ui']);
  assert.deepEqual(skillReads('codex', codexCommand('bash -lc "sed -n 1,200p .ascend/skills/code-review/SKILL.md && cat .ascend/skills/static-analysis/SKILL.md"')), ['code-review', 'static-analysis']);
  assert.deepEqual(skillReads('claude', { type: 'assistant', message: { content: [{ type: 'text', text: 'I will read .ascend/skills/x/SKILL.md' }] } }), []);
  assert.deepEqual(skillReads('codex', { type: 'item.completed', item: { type: 'agent_message', text: '.ascend/skills/x/SKILL.md' } }), []);
  assert.deepEqual(skillReads('codex', codexCommand('ls .ascend/skills/')), [], 'listing the folder is not reading a skill');
  assert.deepEqual(skillReads('agy', claudeRead('.ascend/skills/x/SKILL.md')), [], 'Antigravity events have their own shape');
  const agyTool = (state, parameters) => ({ event: 'step_update', step_update: { step_type: 'tool', state, tool_name: 'view_file', tool_info: { name: 'view_file', parameters } } });
  assert.deepEqual(skillReads('agy', agyTool('ACTIVE', { AbsolutePath: 'C:\\b\\app\\.ascend\\skills\\code-review\\SKILL.md' })), ['code-review']);
  assert.deepEqual(skillReads('agy', agyTool('DONE', { CommandLine: 'cat .ascend/skills/magic-ui/SKILL.md' })), ['magic-ui']);
  assert.deepEqual(skillReads('agy', agyTool('DONE', { DirectoryPath: 'C:\\b\\app\\.ascend\\skills' })), [], 'listing the folder is not reading a skill');
  assert.deepEqual(skillReads('agy', { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: '.ascend/skills/x/SKILL.md' } }), []);
});

function addSkill(dataDir, id) {
  const dir = join(dataDir, 'skills', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: About ${id}.\n---\n`, 'utf8');
}

test('each task records which agent read which skill, in its build and review turns', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  addSkill(dataDir, 'react-best-practices');
  addSkill(dataDir, 'code-review');
  writeRoleSets(dataDir, { sets: { frontend: { on: true }, 'code-reviewer': { on: true } } });
  const respond = ({ stage, agent, emit }) => {
    if (stage === 'plan') return { text: json({ tasks: [{ title: 'Page', assignee: 'claude', description: 'd', role: 'frontend' }, { title: 'Docs', assignee: 'claude', description: 'e' }] }) };
    if (stage === 'build') {
      if (agent === 'claude') emit(claudeRead('.ascend/skills/react-best-practices/SKILL.md'));
      return { text: 'ok', files: { [`f${Math.random()}.txt`]: 'x' } };
    }
    if (stage === 'review') {
      emit(codexCommand('cat .ascend/skills/code-review/SKILL.md'));
      return { text: json({ verdict: 'ok' }) };
    }
    return { text: '# Done' };
  };
  const session = RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond) },
    { project: 'reads-app', task: 't', roles: { orchestrator: 'agy', coders: ['claude'], reviewer: 'codex' } });
  await session.kick();
  await session.gate({ gate: 'plan', decision: 'approve' });
  const [page, docs] = session.state.plan.tasks;
  assert.deepEqual(page.skillsRead, { claude: ['react-best-practices'], codex: ['code-review'] });
  assert.deepEqual(docs.skillsRead, { claude: ['react-best-practices'], codex: ['code-review'] }, 'every turn on a task counts, even without a role');
});

test('a session may choose its own role sets, whatever the switches say', () => {
  const { dataDir, buildsRoot } = tempRoom();
  addSkill(dataDir, 'differential-review');
  writeRoleSets(dataDir, { sets: { frontend: { on: true } } });
  assert.deepEqual(activeRoleSets(dataDir, ['security']).map(s => s.id), ['security']);
  const roles = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
  const create = (project, roleSets) => RoomSession.create({ dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(() => ({ text: 'x' })) }, { project, task: 't', roles, roleSets });
  assert.deepEqual(create('own-sets', ['security']).state.roleSets.map(s => [s.id, s.skills.map(k => k.id)]), [['security', ['differential-review']]]);
  assert.deepEqual(create('no-sets', []).state.roleSets, []);
  assert.deepEqual(create('switch-sets', undefined).state.roleSets.map(s => s.id), ['frontend']);
  assert.throws(() => create('bad-sets', ['devops']), /ROLE_SETS_INVALID/);
  assert.throws(() => create('bad-sets2', 'security'), /ROLE_SETS_INVALID/);
});
