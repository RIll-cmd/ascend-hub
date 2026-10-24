import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cleanAttachments, saveAttachments, taskReferences } from '../../scripts/agent-room/attachments.mjs';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 1)]);
const b64 = data => Buffer.from(data).toString('base64');

// A one-page PDF that says "Hello spec", with a correct cross-reference table.
function tinyPdf() {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '<</Length 41>>stream\nBT /F1 18 Tf 20 40 Td (Hello spec) Tj ET\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('uploads must be few, small and really what their extension says; names are made safe and unique', () => {
  const ok = cleanAttachments([{ name: 'C:\\shots\\My Shot!.png', data: b64(PNG) }, { name: 'notes.md', data: b64('# hi') }, { name: 'My Shot.png', data: b64(PNG) }]);
  assert.deepEqual(ok.map(a => [a.name, a.kind]), [['My-Shot.png', 'image'], ['notes.md', 'text'], ['My-Shot-2.png', 'image']]);
  assert.deepEqual(cleanAttachments(undefined), []);
  const bad = [
    [[{ name: 'fake.png', data: b64('not a png') }], /ATTACHMENT_TYPE/],
    [[{ name: 'run.exe', data: b64('MZ') }], /ATTACHMENT_TYPE/],
    [[{ name: 'bin.txt', data: b64(Buffer.from([1, 0, 2])) }], /ATTACHMENT_TYPE/],
    [Array.from({ length: 6 }, (_, i) => ({ name: `${i}.md`, data: b64('x') })), /ATTACHMENTS_INVALID/],
    [[{ name: 'big.md', data: b64(Buffer.alloc(9 * 1024 * 1024, 65)) }], /ATTACHMENT_SIZE/],
    ['nope', /ATTACHMENTS_INVALID/],
  ];
  for (const [list, error] of bad) assert.throws(() => cleanAttachments(list), error);
});

test('@diff and @paths are found; mentions and e-mail addresses are not', () => {
  assert.deepEqual(taskReferences('Fix @src/app.js and @README.md, see @diff. Ask @claude or me@example.com about @diffs.'),
    { diff: true, files: ['src/app.js', 'README.md'] });
  assert.deepEqual(taskReferences('@.github/ci.yml first'), { diff: false, files: ['.github/ci.yml'] });
  assert.deepEqual(taskReferences('nothing here'), { diff: false, files: [] });
});

function repoSetup() {
  const { dataDir, buildsRoot } = tempRoom();
  const repo = join(dataDir, '..', 'myrepo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'src', 'app.js'), 'old\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  const calls = [];
  const respond = ({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'Fix', assignee: 'claude', description: 'd' }] }) } : { text: 'x' });
  const opts = { dataDir, settings: { ...testSettings(buildsRoot), debateFolders: [repo] }, runTurn: fakeRunTurn(respond, calls) };
  return { repo, buildsRoot, calls, opts };
}

test('a repo session saves attachments and the owner\'s @diff outside git, and every prompt lists them', async () => {
  const { repo, calls, opts } = repoSetup();
  writeFileSync(join(repo, 'src', 'app.js'), 'new work in progress\n');
  const s = RoomSession.create(opts, {
    project: 'fix', repo, roles: ROLES, task: 'Finish @src/app.js like in @diff and the screenshot.',
    attachments: [{ name: 'shot.png', data: b64(PNG) }, { name: 'notes.md', data: b64('Use tabs.') }],
  });
  const dir = s.state.projectDir;
  assert.deepEqual(s.state.fileRefs, ['src/app.js']);
  assert.deepEqual(s.state.attachments.map(a => [a.path, a.kind]), [
    ['.ascend/attachments/shot.png', 'image'], ['.ascend/attachments/notes.md', 'text'], ['.ascend/attachments/owner-changes.diff', 'diff']]);
  assert.ok(readFileSync(join(dir, '.ascend', 'attachments', 'shot.png')).equals(PNG));
  assert.match(readFileSync(join(dir, '.ascend', 'attachments', 'owner-changes.diff'), 'utf8'), /\+new work in progress/);
  assert.equal(git(dir, 'status', '--porcelain').stdout.trim(), '', 'attachments are never committed');
  await s.kick();
  const plan = calls.find(c => c.stage === 'plan').prompt;
  assert.match(plan, /ATTACHMENTS from the owner, in the project folder\. Read each before you start:\n- \.ascend\/attachments\/shot\.png \(image: open it/);
  assert.match(plan, /- \.ascend\/attachments\/owner-changes\.diff \(the owner's uncommitted changes in their own checkout\)/);
  assert.match(plan, /FILES THE OWNER POINTS AT: src\/app\.js/);
  await s.stop();
});

test('bad references and debate attachments are refused before anything is created', () => {
  const { repo, buildsRoot, opts } = repoSetup();
  assert.throws(() => RoomSession.create(opts, { project: 'x', repo, roles: ROLES, task: 'See @src/missing.js' }), /FILE_REF_UNKNOWN: @src\/missing\.js/);
  assert.throws(() => RoomSession.create(opts, { project: 'x', repo, roles: ROLES, task: 'Use @diff' }), /DIFF_EMPTY/);
  assert.equal(existsSync(join(buildsRoot, 'worktrees')), false, 'no worktree was made');
  assert.throws(() => RoomSession.create(opts, { project: 'x', roles: ROLES, task: 'Edit @src/app.js' }), /REFS_NEED_REPO/);
  assert.throws(() => RoomSession.create(opts, { mode: 'debate', folder: repo, question: 'q?', attachments: [{ name: 'a.md', data: b64('x') }] }), /ATTACHMENTS_BUILD_ONLY/);
});

test('a PDF spec gets its text beside it when pdftotext or Python\'s pypdf is available', t => {
  const hasTool = spawnSync('pdftotext', ['-v'], { windowsHide: true }).status === 0
    || spawnSync('python', ['-c', 'import pypdf'], { windowsHide: true, cwd: tmpdir() }).status === 0;
  if (!hasTool) return t.skip('neither pdftotext nor pypdf is installed');
  const dir = mkdtempSync(join(tmpdir(), 'ascend-attach-'));
  git(dir, 'init', '-q');
  const [saved] = saveAttachments(dir, cleanAttachments([{ name: 'spec.pdf', data: b64(tinyPdf()) }]), {});
  assert.equal(saved.text, '.ascend/attachments/spec.pdf.txt');
  assert.match(readFileSync(join(dir, saved.text), 'utf8'), /Hello spec/);
});
