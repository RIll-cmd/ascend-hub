import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROLE_SETS, listSkills, readRoleSets, writeRoleSets } from '../../scripts/agent-room/skills.mjs';
import { startRoomServer } from '../../scripts/agent-room/server.mjs';
import { tempRoom, testSettings } from './helpers.mjs';

function addSkill(dataDir, id, files) {
  const dir = join(dataDir, 'skills', id);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text, 'utf8');
  }
}

const skillMd = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

test('the starting role sets name only known skills, all off until the owner turns a set on', () => {
  assert.deepEqual(ROLE_SETS.map(s => s.id), ['general', 'ui-ux', 'frontend', 'code-reviewer', 'backend', 'security', 'testing']);
  assert.equal(new Set(ROLE_SETS.flatMap(s => s.skills.map(k => k.source))).size, new Set(ROLE_SETS.flatMap(s => s.skills.map(k => k.id))).size, 'one source per skill id');
  assert.ok(ROLE_SETS.flatMap(s => s.skills).every(k => k.source.startsWith('https://github.com/')), 'every source can be fetched');
  const { dataDir } = tempRoom();
  const sets = readRoleSets(dataDir);
  assert.ok(sets.every(s => s.on === false));
  const backend = sets.find(s => s.id === 'backend');
  assert.equal(backend.skills.find(k => k.id === 'supabase-postgres').on, false, 'Supabase is off by default');
  assert.equal(backend.skills.find(k => k.id === 'api-design-principles').on, true);
  assert.ok(sets.flatMap(s => s.skills).every(k => k.installed === false && /^https:\/\//.test(k.source)));
});

test('the library is the skill folders with a SKILL.md, with their front matter and a scripts flag', () => {
  const { dataDir } = tempRoom();
  addSkill(dataDir, 'impeccable', { 'SKILL.md': skillMd('Impeccable', 'Design polish rules.') });
  addSkill(dataDir, 'static-analysis', { 'SKILL.md': skillMd('static-analysis', 'Run Semgrep.'), 'scripts/run.sh': 'semgrep .' });
  addSkill(dataDir, 'no-skill-md', { 'README.md': 'x' });
  addSkill(dataDir, 'Bad Name', { 'SKILL.md': skillMd('x', 'y') });
  const skills = listSkills(dataDir);
  assert.deepEqual(skills.map(s => s.id), ['impeccable', 'static-analysis']);
  assert.deepEqual(skills[0], { id: 'impeccable', name: 'Impeccable', description: 'Design polish rules.', hasScripts: false, source: null,
    usage: { offered: 0, read: 0, sinceRead: 0, lastRead: null, stale: false } });
  assert.equal(skills[1].hasScripts, true);
  assert.deepEqual(listSkills(tempRoom().dataDir), [], 'no library folder yet');

  const ux = readRoleSets(dataDir).find(s => s.id === 'ui-ux').skills.find(k => k.id === 'impeccable');
  assert.equal(ux.installed, true);
  assert.equal(ux.description, 'Design polish rules.');
});

test('the switches are kept in role-sets.json and merged over the defaults', () => {
  const { dataDir } = tempRoom();
  writeRoleSets(dataDir, { sets: { frontend: { on: true, skills: { 'magic-ui': false } } } });
  const sets = writeRoleSets(dataDir, { sets: { security: { on: true } } });
  const frontend = sets.find(s => s.id === 'frontend');
  assert.equal(frontend.on, true, 'an earlier switch survives a later write');
  assert.equal(frontend.skills.find(k => k.id === 'magic-ui').on, false);
  assert.equal(frontend.skills.find(k => k.id === 'react-best-practices').on, true);
  assert.equal(sets.find(s => s.id === 'security').on, true);
  assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'role-sets.json'), 'utf8')).sets.frontend, { on: true, skills: { 'magic-ui': false } });
  assert.deepEqual(readRoleSets(dataDir), sets);
});

test('unknown sets, unknown skills and non-boolean switches are refused', () => {
  const { dataDir } = tempRoom();
  assert.throws(() => writeRoleSets(dataDir, { sets: { devops: { on: true } } }), /ROLE_SET_INVALID/);
  assert.throws(() => writeRoleSets(dataDir, { sets: { frontend: { on: 'yes' } } }), /ROLE_SET_INVALID/);
  assert.throws(() => writeRoleSets(dataDir, { sets: { frontend: { skills: { 'code-review': true } } } }), /ROLE_SET_INVALID/, 'a skill from another set');
  assert.throws(() => writeRoleSets(dataDir, { sets: [] }), /ROLE_SET_INVALID/);
});

test('the room server reads and writes the role sets', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), probe: async () => ({ state: 'ready' }), port: 0 });
  const call = (method, body) => fetch(`http://127.0.0.1:${room.port}/role-sets`, {
    method, headers: { authorization: `Bearer ${room.token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  });
  try {
    assert.equal((await (await call('GET')).json()).sets.length, 7);
    const saved = await (await call('POST', { sets: { 'code-reviewer': { on: true } } })).json();
    assert.equal(saved.sets.find(s => s.id === 'code-reviewer').on, true);
    assert.equal((await call('POST', { sets: { nope: { on: true } } })).status, 400);
  } finally {
    await room.close();
  }
});
