# Agent Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Codex, Claude and Antigravity discuss a coding task, agree on roles, plan, and build a new project together. Hub's `/room` page (opened from the shelf poster) shows them working, and the owner approves at three gates.

**Architecture:** A local Node room process (`scripts/agent-room/`) owns one session at a time. It runs each CLI headless per turn, with role-based permission flags, and stores state under `.sites-runtime/agent-room/`. Projects are built as git repositories under `D:\ascend-builds\<project>\`. Hub's API routes forward commands to the room process over `127.0.0.1` with a token, and the `/room` client page polls them.

**Tech Stack:** Node ≥ 22.13 ESM (`node:http`, `node:child_process`, `node:test`), git CLI, React 19 / Next-compatible app router via Vinext, plain global CSS.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-room-design.md`

## Global Constraints

- No new npm dependencies.
- The room process code is `.mjs` ESM under `scripts/agent-room/`. Hub code is TypeScript. Tests use `node:test`: `.mjs` files run with `node --no-warnings --test`, `.ts` files with `npx --no-install tsx --test`.
- Windows is the target. Child processes are spawned with an argument array and `windowsHide: true`, never through a shell string. A process tree is killed with `taskkill /PID <pid> /T /F`.
- Agent ids are exactly `codex`, `claude`, `agy`; display names are `Codex`, `Claude`, `Antigravity`.
- Project names match `^[a-z0-9][a-z0-9-]{0,39}$`. The builds root defaults to `D:\ascend-builds` (env `ASCEND_BUILDS_ROOT`).
- The room listens on `127.0.0.1` only, default port `5181` (env `ASCEND_ROOM_PORT`). Every request needs `Authorization: Bearer <token>`.
- The task text is at most 4,000 characters; a plan has 1–20 tasks; a task title is at most 120 characters and a description at most 2,000.
- Turn time limits: 180,000 ms for chat (Discuss, Roles, Plan, Review, Reassign, Finish) and 900,000 ms for a Build task.
- Discussion is at most 6 turns, ending early when every agent's latest message contains `[READY]`.
- Prompts are at most 28,000 characters (Windows command-line limit for `agy --print=<prompt>`). The transcript tail is at most 20 messages and 12,000 characters.
- Codex always gets an explicit model (`-m gpt-6-astra` by default). Never edit `~/.codex/config.toml`.
- Claude in edit mode gets exactly `--allowedTools Bash(node:*) Bash(npm:*) Bash(npx:*) "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)"` and always `--disallowedTools PowerShell`.
- New and changed files must pass `npm run lint` with no new errors. Don't touch the 34 pre-existing lint errors in older files.

### Verified CLI invocations (spike on 2026-10-13)

| Agent | Executable | Read mode | Edit mode | Prompt | Final text |
| --- | --- | --- | --- | --- | --- |
| codex | `node %APPDATA%\npm\node_modules\@openai\codex\bin\codex.js` | `exec -m <model> --sandbox read-only --skip-git-repo-check -C <dir> -o <file> -` | same with `--sandbox workspace-write` (edits + any command) | stdin | the `-o` file |
| claude | `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` | `-p --permission-mode plan --disallowedTools PowerShell` | `-p --permission-mode acceptEdits --disallowedTools PowerShell --allowedTools …` (edits, simple file commands such as `mkdir`, and the allowlist; `curl` and `git commit` are refused) | stdin | stdout |
| agy | `%LOCALAPPDATA%\agy\bin\agy.exe` | `--mode plan --print=<prompt>` | `--mode accept-edits --print=<prompt>` (edits + commands) | argument only; stdin is **not** read | stdout |

## Review Focus

1. **An agent wraps its JSON in prose or emits several json blocks.** Use the last fenced `json` block, and on failure re-ask once with the exact error. Test: Task 2.
2. **A prompt containing quotes, newlines or `--` is passed to `agy` as an argument.** It must stay a single argv element and never go through a shell. Tests: Task 4 (invocation shape plus a real child process echoing it back).
3. **The owner presses Stop while an agent is mid-edit.** The child tree is killed, uncommitted files are rolled back, the stage becomes `stopped`, and no further turn runs. Test: Task 7.
4. **The room process restarts mid-build.** The session reloads, the half-done task's uncommitted files are rolled back, and the task re-runs. Test: Task 7.
5. **The project name points outside the builds root or at an existing folder, symlink or junction.** It's refused before anything is created. Test: Task 1.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/agent-room/paths.mjs` | Project-name and path rules, data dir, the `roomError` helper |
| `scripts/agent-room/store.mjs` | Atomic JSON writes, JSONL append and read |
| `scripts/agent-room/parse.mjs` | Agent ids, json-block extraction, validators for roles, plan, verdict and reassign, `isReady` |
| `scripts/agent-room/project.mjs` | Project git: create, commit, rollback, diff, `renderPlan` |
| `scripts/agent-room/agents.mjs` | Settings defaults and merging, `buildInvocation`, `runTurn`, `killTree` |
| `scripts/agent-room/prompts.mjs` | `buildPrompt`, `transcriptTail`, stage rules, display names |
| `scripts/agent-room/session.mjs` | `RoomSession` stage machine (persist, restore, gates, pause, stop) |
| `scripts/agent-room/server.mjs` | HTTP API, token, availability probes, restore on start, idle exit, CLI entry |
| `tests/agent-room/*.test.mjs` | Unit and integration tests for the room process |
| `tests/agent-room/helpers.mjs` | `fakeRunTurn`, `testSettings`, temp-dir helpers |
| `tests/agent-room/fixtures/fake-cli.mjs` | A real child process standing in for a CLI in `runTurn` tests |
| `app/room/room-proxy.ts` | Server-side helpers: read `server.json`, forward to the room, validate commands, start the room process |
| `app/api/room/**/route.ts` | Seven thin route handlers |
| `app/room/room-types.ts` | Shared client types and constants |
| `app/room/room-parts.tsx` | CRT, stage steps, transcript, task board, brief form, gates |
| `app/room/page.tsx` | `/room` page and the polling hook |
| `app/room/room.css` | Room styles (global, `agent-room-` prefix), imported in `app/layout.tsx` |
| `app/page.tsx`, `app/globals.css` | The poster becomes a link to `/room` |
| `tests/agent-room/room-proxy.test.ts`, `tests/agent-room/poster-link.test.mjs` | Hub-side tests |

Work on a new branch: `git switch -c claude/agent-room` from `main` in `D:\ascend_hub`. Leave the untracked `AGENTS.md`, `ASCEND_HANDOFF.md` and `CLAUDE.md` alone except where Task 12 says to update the handoff.

---

### Task 1: Path rules and the JSON store

**Files:**
- Create: `scripts/agent-room/paths.mjs`
- Create: `scripts/agent-room/store.mjs`
- Test: `tests/agent-room/paths-store.test.mjs`

**Interfaces:**
- Produces: `PROJECT_NAME: RegExp`; `roomError(code: string, detail?: string): Error & { code }`; `roomDataDir(hubRoot: string): string`; `resolveProjectDir(buildsRoot: string, name: string, { allowExisting = false } = {}): string`, which throws `PROJECT_NAME_INVALID | PROJECT_EXISTS | PROJECT_PATH_IS_LINK | BUILDS_ROOT_IS_LINK`.
- Produces: `writeJsonAtomic(file, value): void`, `readJson(file, fallback = null)`, `appendJsonLine(file, value): void`, `readJsonLines(file): any[]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/paths-store.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveProjectDir, roomDataDir } from '../../scripts/agent-room/paths.mjs';
import { appendJsonLine, readJson, readJsonLines, writeJsonAtomic } from '../../scripts/agent-room/store.mjs';

const root = () => mkdtempSync(join(tmpdir(), 'ascend-room-paths-'));

test('accepts a valid new project name directly under the builds root', () => {
  const r = root();
  assert.equal(resolveProjectDir(r, 'todo-system'), join(r, 'todo-system'));
});

test('rejects names that could escape or are malformed', () => {
  const r = root();
  for (const bad of ['', '..', '../x', 'a/b', 'a\\b', 'Todo', '-x', 'x'.repeat(41), 'a b', 'c:', 42, undefined]) {
    assert.throws(() => resolveProjectDir(r, bad), { code: 'PROJECT_NAME_INVALID' }, String(bad));
  }
});

test('refuses an existing folder unless resuming', () => {
  const r = root();
  mkdirSync(join(r, 'todo'));
  assert.throws(() => resolveProjectDir(r, 'todo'), { code: 'PROJECT_EXISTS' });
  assert.equal(resolveProjectDir(r, 'todo', { allowExisting: true }), join(r, 'todo'));
});

test('refuses a project path that is a junction or symlink', () => {
  const r = root();
  const elsewhere = mkdtempSync(join(tmpdir(), 'ascend-room-target-'));
  symlinkSync(elsewhere, join(r, 'linked'), 'junction');
  assert.throws(() => resolveProjectDir(r, 'linked', { allowExisting: true }), { code: 'PROJECT_PATH_IS_LINK' });
});

test('refuses a builds root that is itself a junction', () => {
  const parent = root();
  const real = mkdtempSync(join(tmpdir(), 'ascend-room-real-'));
  symlinkSync(real, join(parent, 'builds'), 'junction');
  assert.throws(() => resolveProjectDir(join(parent, 'builds'), 'ok'), { code: 'BUILDS_ROOT_IS_LINK' });
});

test('room data lives in the git-ignored runtime folder', () => {
  assert.equal(roomDataDir('D:\\hub'), join('D:\\hub', '.sites-runtime', 'agent-room'));
});

test('store writes JSON atomically and appends JSON lines', () => {
  const dir = root();
  const file = join(dir, 'nested', 'state.json');
  writeJsonAtomic(file, { a: 1 });
  writeJsonAtomic(file, { a: 2 });
  assert.deepEqual(readJson(file), { a: 2 });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 2 });
  assert.equal(readJson(join(dir, 'missing.json'), 'fallback'), 'fallback');
  const lines = join(dir, 'nested', 't.jsonl');
  appendJsonLine(lines, { n: 1 });
  appendJsonLine(lines, { n: 2 });
  assert.deepEqual(readJsonLines(lines), [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(readJsonLines(join(dir, 'none.jsonl')), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/paths-store.test.mjs`
Expected: FAIL with `Cannot find module '.../scripts/agent-room/paths.mjs'`

- [ ] **Step 3: Write the minimal implementation**

```js
// scripts/agent-room/paths.mjs
import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function roomError(code, detail) {
  return Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
}

export function roomDataDir(hubRoot) {
  return join(hubRoot, '.sites-runtime', 'agent-room');
}

export function resolveProjectDir(buildsRoot, name, { allowExisting = false } = {}) {
  if (typeof name !== 'string' || !PROJECT_NAME.test(name)) throw roomError('PROJECT_NAME_INVALID');
  const root = resolve(buildsRoot);
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw roomError('BUILDS_ROOT_IS_LINK');
  const dir = join(root, name);
  // The name rule already forbids separators; this guards the rule itself.
  if (dirname(dir) !== root) throw roomError('PROJECT_NAME_INVALID');
  if (existsSync(dir)) {
    if (lstatSync(dir).isSymbolicLink()) throw roomError('PROJECT_PATH_IS_LINK');
    if (!allowExisting) throw roomError('PROJECT_EXISTS');
  }
  return dir;
}
```

```js
// scripts/agent-room/store.mjs
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, file);
}

export function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function appendJsonLine(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(value)}\n`, 'utf8');
}

export function readJsonLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/paths-store.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-room/paths.mjs scripts/agent-room/store.mjs tests/agent-room/paths-store.test.mjs
git commit -m "feat(agent-room): project path rules and JSON store"
```

---

### Task 2: Parsing and validating agent answers

**Files:**
- Create: `scripts/agent-room/parse.mjs`
- Test: `tests/agent-room/parse.test.mjs`

**Interfaces:**
- Produces: `AGENT_IDS = ['codex', 'claude', 'agy']`; `isReady(text): boolean`; `extractJsonBlock(text): { ok: true, value } | { ok: false, error: string }`.
- Produces: `validateRoles(v)` → `{ ok, value: { orchestrator, coders: string[], reviewer: string | null } } | { ok: false, error }`.
- Produces: `validatePlan(v, coders)` → `{ ok, value: { tasks: [{ id, title, assignee, description }] } }`, with ids renumbered 1..n and titles collapsed to one line.
- Produces: `validateVerdict(v)` → `{ ok, value: { verdict: 'ok' | 'changes', notes } }`; `validateReassign(v, coders, current)` → `{ ok, value: { action: 'skip' } | { action: 'reassign', to } }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/parse.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJsonBlock, isReady, validatePlan, validateReassign, validateRoles, validateVerdict } from '../../scripts/agent-room/parse.mjs';

test('uses the last fenced json block and ignores surrounding prose', () => {
  const text = 'Thoughts...\n```json\n{"a":1}\n```\nOn reflection:\n```json\n{"a":2}\n```\nDone.';
  assert.deepEqual(extractJsonBlock(text), { ok: true, value: { a: 2 } });
});

test('reports a missing or broken json block with a reason', () => {
  assert.equal(extractJsonBlock('no block here').ok, false);
  assert.match(extractJsonBlock('no block here').error, /No ```json block/);
  const broken = extractJsonBlock('```json\n{"a":}\n```');
  assert.equal(broken.ok, false);
  assert.match(broken.error, /not valid JSON/);
});

test('validates roles', () => {
  assert.deepEqual(validateRoles({ orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null }),
    { ok: true, value: { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null } });
  assert.deepEqual(validateRoles({ orchestrator: 'codex', coders: ['codex'] }).value.reviewer, null);
  for (const bad of [null, [], { orchestrator: 'gpt', coders: ['claude'] }, { orchestrator: 'codex', coders: [] },
    { orchestrator: 'codex', coders: ['claude', 'claude'] }, { orchestrator: 'codex', coders: ['claude'], reviewer: 'me' }]) {
    assert.equal(validateRoles(bad).ok, false, JSON.stringify(bad));
  }
});

test('validates a plan, renumbers ids and flattens titles', () => {
  const plan = validatePlan({ tasks: [{ id: 9, title: ' Scaffold\nproject ', assignee: 'claude', description: 'Set up.' }] }, ['claude']);
  assert.deepEqual(plan, { ok: true, value: { tasks: [{ id: 1, title: 'Scaffold project', assignee: 'claude', description: 'Set up.' }] } });
  assert.equal(validatePlan({ tasks: [] }, ['claude']).ok, false);
  assert.equal(validatePlan({ tasks: Array.from({ length: 21 }, () => ({ title: 't', assignee: 'claude', description: '' })) }, ['claude']).ok, false);
  assert.match(validatePlan({ tasks: [{ title: 't', assignee: 'agy', description: '' }] }, ['claude']).error, /assignee must be one of the coders: claude/);
  assert.equal(validatePlan({ tasks: [{ title: 'x'.repeat(121), assignee: 'claude', description: '' }] }, ['claude']).ok, false);
  assert.equal(validatePlan({ tasks: [{ title: 't', assignee: 'claude', description: 'x'.repeat(2001) }] }, ['claude']).ok, false);
});

test('validates review verdicts and reassign decisions', () => {
  assert.deepEqual(validateVerdict({ verdict: 'changes', notes: 'fix x' }), { ok: true, value: { verdict: 'changes', notes: 'fix x' } });
  assert.deepEqual(validateVerdict({ verdict: 'ok' }).value, { verdict: 'ok', notes: '' });
  assert.equal(validateVerdict({ verdict: 'maybe' }).ok, false);
  assert.deepEqual(validateReassign({ action: 'skip' }, ['claude'], 'claude').value, { action: 'skip' });
  assert.deepEqual(validateReassign({ action: 'reassign', to: 'agy' }, ['claude', 'agy'], 'claude').value, { action: 'reassign', to: 'agy' });
  assert.equal(validateReassign({ action: 'reassign', to: 'claude' }, ['claude', 'agy'], 'claude').ok, false);
});

test('detects the ready marker', () => {
  assert.equal(isReady('Sounds good. [READY]'), true);
  assert.equal(isReady('Not yet.'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/parse.test.mjs`
Expected: FAIL with `Cannot find module '.../parse.mjs'`

- [ ] **Step 3: Write the minimal implementation**

```js
// scripts/agent-room/parse.mjs
export const AGENT_IDS = ['codex', 'claude', 'agy'];

const fail = error => ({ ok: false, error });
const isAgent = value => AGENT_IDS.includes(value);

export const isReady = text => /\[READY\]/.test(String(text));

export function extractJsonBlock(text) {
  const blocks = [...String(text).matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (blocks.length === 0) return fail('No ```json block found.');
  try {
    return { ok: true, value: JSON.parse(blocks.at(-1)[1]) };
  } catch (error) {
    return fail(`The json block is not valid JSON: ${error.message}`);
  }
}

export function validateRoles(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('Roles must be an object.');
  if (!isAgent(v.orchestrator)) return fail('orchestrator must be one of codex, claude, agy.');
  if (!Array.isArray(v.coders) || v.coders.length === 0 || !v.coders.every(isAgent) || new Set(v.coders).size !== v.coders.length) {
    return fail('coders must be a non-empty list of distinct agents (codex, claude, agy).');
  }
  const reviewer = v.reviewer ?? null;
  if (reviewer !== null && !isAgent(reviewer)) return fail('reviewer must be an agent id or null.');
  return { ok: true, value: { orchestrator: v.orchestrator, coders: [...v.coders], reviewer } };
}

export function validatePlan(v, coders) {
  if (!v || !Array.isArray(v.tasks) || v.tasks.length < 1 || v.tasks.length > 20) return fail('tasks must be a list of 1 to 20 tasks.');
  const tasks = [];
  for (const [index, task] of v.tasks.entries()) {
    const n = index + 1;
    if (!task || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120) return fail(`Task ${n} needs a title of at most 120 characters.`);
    if (typeof task.description !== 'string' || task.description.length > 2000) return fail(`Task ${n} needs a description of at most 2000 characters.`);
    if (!coders.includes(task.assignee)) return fail(`Task ${n} assignee must be one of the coders: ${coders.join(', ')}.`);
    tasks.push({ id: n, title: task.title.replace(/\s+/g, ' ').trim(), assignee: task.assignee, description: task.description.trim() });
  }
  return { ok: true, value: { tasks } };
}

export function validateVerdict(v) {
  if (!v || !['ok', 'changes'].includes(v.verdict)) return fail('verdict must be "ok" or "changes".');
  return { ok: true, value: { verdict: v.verdict, notes: typeof v.notes === 'string' ? v.notes.slice(0, 4000) : '' } };
}

export function validateReassign(v, coders, current) {
  if (v?.action === 'skip') return { ok: true, value: { action: 'skip' } };
  if (v?.action === 'reassign' && coders.includes(v.to) && v.to !== current) return { ok: true, value: { action: 'reassign', to: v.to } };
  return fail(`action must be "skip" or "reassign" to a different coder (${coders.join(', ')}).`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/parse.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-room/parse.mjs tests/agent-room/parse.test.mjs
git commit -m "feat(agent-room): parse and validate agent JSON answers"
```

---

### Task 3: Project git operations

**Files:**
- Create: `scripts/agent-room/project.mjs`
- Test: `tests/agent-room/project.test.mjs`

**Interfaces:**
- Consumes: `roomError` (Task 1).
- Produces: `createProject(dir): void` (non-recursive mkdir; `git init -b main`; writes `.gitignore` with `node_modules/`; commits `chore: start project`).
- Produces: `commitAll(dir, message): string | null` (short hash, or `null` when nothing changed); `rollback(dir): void` (`reset --hard HEAD` and `clean -fd`); `lastCommitDiff(dir): string`; `renderPlan(tasks): string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/project.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { commitAll, createProject, lastCommitDiff, renderPlan, rollback } from '../../scripts/agent-room/project.mjs';

const log = dir => spawnSync('git', ['log', '--format=%s|%an'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n');

test('creates a git project with a first commit by the room', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ascend-room-project-')), 'todo');
  createProject(dir);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\n');
  assert.deepEqual(log(dir), ['chore: start project|Ascend Agent Room']);
  assert.throws(() => createProject(dir), /EEXIST/);
});

test('commits changes, returns null when nothing changed, and shows the last diff', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ascend-room-project-')), 'p');
  createProject(dir);
  assert.equal(commitAll(dir, 'nothing'), null);
  writeFileSync(join(dir, 'a.txt'), 'hello\n');
  const hash = commitAll(dir, 'task-1: add a');
  assert.match(hash, /^[0-9a-f]{7,}$/);
  assert.equal(log(dir)[0], 'task-1: add a|Ascend Agent Room');
  assert.match(lastCommitDiff(dir), /\+hello/);
});

test('rollback discards uncommitted edits and new files only', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ascend-room-project-')), 'p');
  createProject(dir);
  writeFileSync(join(dir, 'kept.txt'), 'v1\n');
  commitAll(dir, 'keep');
  writeFileSync(join(dir, 'kept.txt'), 'v2\n');
  writeFileSync(join(dir, 'new.txt'), 'x');
  rollback(dir);
  assert.equal(readFileSync(join(dir, 'kept.txt'), 'utf8'), 'v1\n');
  assert.equal(existsSync(join(dir, 'new.txt')), false);
});

test('renders the plan as Markdown', () => {
  assert.equal(renderPlan([{ id: 1, title: 'Scaffold', assignee: 'claude', description: 'Line one\nLine two' }]),
    '# Plan\n\n1. **Scaffold** (claude)\n   Line one\n   Line two\n');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/project.test.mjs`
Expected: FAIL with `Cannot find module '.../project.mjs'`

- [ ] **Step 3: Write the minimal implementation**

```js
// scripts/agent-room/project.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { roomError } from './paths.mjs';

const IDENTITY = ['-c', 'user.name=Ascend Agent Room', '-c', 'user.email=agent-room@localhost'];

function git(dir, args) {
  const result = spawnSync('git', [...IDENTITY, ...args], { cwd: dir, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw roomError('GIT_UNAVAILABLE', result.error.message);
  if (result.status !== 0) throw roomError('GIT_FAILED', `git ${args[0]}: ${result.stderr.trim()}`);
  return result.stdout;
}

export function createProject(dir) {
  mkdirSync(dir); // non-recursive on purpose: an existing folder must fail
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n', 'utf8');
  commitAll(dir, 'chore: start project');
}

export function commitAll(dir, message) {
  git(dir, ['add', '-A']);
  if (git(dir, ['status', '--porcelain']).trim() === '') return null;
  git(dir, ['commit', '-q', '-m', message]);
  return git(dir, ['rev-parse', '--short', 'HEAD']).trim();
}

export function rollback(dir) {
  git(dir, ['reset', '-q', '--hard', 'HEAD']);
  git(dir, ['clean', '-fdq']);
}

export function lastCommitDiff(dir) {
  return git(dir, ['show', '--stat', '--patch', '--format=%s', 'HEAD']);
}

export function renderPlan(tasks) {
  return ['# Plan', '', ...tasks.map(t => `${t.id}. **${t.title}** (${t.assignee})\n   ${t.description.replace(/\n/g, '\n   ')}`), ''].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/project.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-room/project.mjs tests/agent-room/project.test.mjs
git commit -m "feat(agent-room): project git create, commit, rollback"
```

---

### Task 4: CLI invocations and running a turn

**Files:**
- Create: `scripts/agent-room/agents.mjs`
- Create: `tests/agent-room/fixtures/fake-cli.mjs`
- Test: `tests/agent-room/agents.test.mjs`

**Interfaces:**
- Consumes: `roomError` (Task 1).
- Produces: `CLAUDE_ALLOWED_TOOLS: string[]`; `defaultSettings(env = process.env)` → `{ buildsRoot, maxDiscussTurns: 6, timeouts: { chat: 180000, build: 900000 }, agents: { codex: { command, prefixArgs, model }, claude: { command, prefixArgs }, agy: { command, prefixArgs } } }`; `mergeSettings(base, override = {})`.
- Produces: `buildInvocation(agentId, mode: 'read' | 'edit', prompt, { cwd, settings, outFile })` → `{ command, args, stdin: string | null, outFile: string | null }`.
- Produces: `runTurn(invocation, { cwd, timeoutMs, signal })` → `Promise<{ ok, text, stderr, error, code, timedOut, aborted, durationMs }>`; `killTree(child)`.

- [ ] **Step 1: Write the fake CLI fixture**

```js
// tests/agent-room/fixtures/fake-cli.mjs
// Stands in for codex/claude/agy: prompt from --print=<p> or stdin; behavior keyed by prompt text.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const printArg = args.find(a => a.startsWith('--print='));
const outIndex = args.indexOf('-o');
const chunks = [];
if (!printArg) for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = printArg ? printArg.slice('--print='.length) : Buffer.concat(chunks).toString('utf8');

if (prompt.includes('SLEEP')) await new Promise(resolve => setTimeout(resolve, 30_000));
if (prompt.includes('FAIL')) { process.stderr.write('boom'); process.exit(3); }
if (prompt.includes('EMPTY')) process.exit(0);
const reply = `ECHO:${prompt}|ARGS:${JSON.stringify(args)}`;
if (outIndex >= 0) {
  process.stdout.write('noise that is not the final message');
  writeFileSync(args[outIndex + 1], reply);
} else {
  process.stdout.write(reply);
}
```

- [ ] **Step 2: Write the failing test**

```js
// tests/agent-room/agents.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CLAUDE_ALLOWED_TOOLS, buildInvocation, defaultSettings, mergeSettings, runTurn } from '../../scripts/agent-room/agents.mjs';

const fake = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));
const cwd = mkdtempSync(join(tmpdir(), 'ascend-room-agents-'));
const outFile = join(cwd, 'last.txt');
const fakeSettings = mergeSettings(defaultSettings({ APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' }), {
  agents: {
    codex: { command: process.execPath, prefixArgs: [fake] },
    claude: { command: process.execPath, prefixArgs: [fake] },
    agy: { command: process.execPath, prefixArgs: [fake] },
  },
});

test('default settings point at the verified executables', () => {
  const s = defaultSettings({ APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' });
  assert.equal(s.agents.codex.command, process.execPath);
  assert.deepEqual(s.agents.codex.prefixArgs, [join('C:\\A', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')]);
  assert.equal(s.agents.codex.model, 'gpt-6-astra');
  assert.equal(s.agents.claude.command, join('C:\\A', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
  assert.equal(s.agents.agy.command, join('C:\\L', 'agy', 'bin', 'agy.exe'));
  assert.equal(s.buildsRoot, 'D:\\ascend-builds');
  assert.equal(defaultSettings({ ASCEND_BUILDS_ROOT: 'E:\\b' }).buildsRoot, 'E:\\b');
  assert.deepEqual(s.timeouts, { chat: 180000, build: 900000 });
});

test('mergeSettings overrides per agent without dropping defaults', () => {
  const merged = mergeSettings(defaultSettings({}), { agents: { codex: { model: 'x' } }, timeouts: { build: 5 } });
  assert.equal(merged.agents.codex.model, 'x');
  assert.equal(merged.agents.codex.command, process.execPath);
  assert.deepEqual(merged.timeouts, { chat: 180000, build: 5 });
});

test('role mode maps to each CLI permission flag', () => {
  const s = defaultSettings({ APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' });
  const opts = { cwd: 'D:\\b\\p', settings: s, outFile: 'D:\\o.txt' };
  assert.deepEqual(buildInvocation('codex', 'read', 'hi', opts).args.slice(1),
    ['exec', '-m', 'gpt-6-astra', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', 'D:\\b\\p', '-o', 'D:\\o.txt', '-']);
  assert.ok(buildInvocation('codex', 'edit', 'hi', opts).args.includes('workspace-write'));
  assert.equal(buildInvocation('codex', 'read', 'hi', opts).stdin, 'hi');
  assert.deepEqual(buildInvocation('claude', 'read', 'hi', opts).args, ['-p', '--permission-mode', 'plan', '--disallowedTools', 'PowerShell']);
  assert.deepEqual(buildInvocation('claude', 'edit', 'hi', opts).args,
    ['-p', '--permission-mode', 'acceptEdits', '--disallowedTools', 'PowerShell', '--allowedTools', ...CLAUDE_ALLOWED_TOOLS]);
  assert.deepEqual(CLAUDE_ALLOWED_TOOLS, ['Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)']);
  const tricky = 'say "hi" --mode edit\nline2 & del *';
  assert.deepEqual(buildInvocation('agy', 'read', tricky, opts), { command: s.agents.agy.command, args: ['--mode', 'plan', `--print=${tricky}`], stdin: null, outFile: null });
  assert.equal(buildInvocation('agy', 'edit', 'x', opts).args[1], 'accept-edits');
  assert.throws(() => buildInvocation('gpt', 'read', 'x', opts), { code: 'AGENT_UNKNOWN' });
  assert.throws(() => buildInvocation('codex', 'write', 'x', opts), { code: 'MODE_INVALID' });
});

test('runTurn passes a tricky agy prompt as one argument, unchanged', async () => {
  const tricky = 'say "hi" --mode edit\nline2 & del * %PATH%';
  const res = await runTurn(buildInvocation('agy', 'read', tricky, { cwd, settings: fakeSettings, outFile }), { cwd, timeoutMs: 20_000 });
  assert.equal(res.ok, true);
  assert.ok(res.text.startsWith(`ECHO:${tricky}|`), res.text);
});

test('runTurn feeds stdin and reads the codex -o file instead of stdout noise', async () => {
  const res = await runTurn(buildInvocation('codex', 'read', 'hello codex', { cwd, settings: fakeSettings, outFile }), { cwd, timeoutMs: 20_000 });
  assert.equal(res.ok, true);
  assert.ok(res.text.startsWith('ECHO:hello codex|'));
  assert.doesNotMatch(res.text, /noise/);
});

test('runTurn reports failure, empty output, timeout and abort', async () => {
  const inv = prompt => buildInvocation('claude', 'read', prompt, { cwd, settings: fakeSettings, outFile });
  const failed = await runTurn(inv('FAIL'), { cwd, timeoutMs: 20_000 });
  assert.equal(failed.ok, false); assert.equal(failed.code, 3); assert.match(failed.stderr, /boom/);
  const empty = await runTurn(inv('EMPTY'), { cwd, timeoutMs: 20_000 });
  assert.equal(empty.ok, false); assert.equal(empty.code, 0); assert.equal(empty.text, '');
  const slow = await runTurn(inv('SLEEP'), { cwd, timeoutMs: 500 });
  assert.equal(slow.ok, false); assert.equal(slow.timedOut, true);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  const aborted = await runTurn(inv('SLEEP'), { cwd, timeoutMs: 20_000, signal: controller.signal });
  assert.equal(aborted.ok, false); assert.equal(aborted.aborted, true);
  const missing = await runTurn({ command: join(cwd, 'nope.exe'), args: [], stdin: null, outFile: null }, { cwd, timeoutMs: 5_000 });
  assert.equal(missing.ok, false); assert.match(missing.error, /ENOENT/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/agents.test.mjs`
Expected: FAIL with `Cannot find module '.../agents.mjs'`

- [ ] **Step 4: Write the minimal implementation**

```js
// scripts/agent-room/agents.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { roomError } from './paths.mjs';

export const CLAUDE_ALLOWED_TOOLS = ['Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)'];

export function defaultSettings(env = process.env) {
  const npmModules = join(env.APPDATA ?? '', 'npm', 'node_modules');
  return {
    buildsRoot: env.ASCEND_BUILDS_ROOT ?? 'D:\\ascend-builds',
    maxDiscussTurns: 6,
    timeouts: { chat: 180_000, build: 900_000 },
    agents: {
      codex: { command: process.execPath, prefixArgs: [join(npmModules, '@openai', 'codex', 'bin', 'codex.js')], model: 'gpt-6-astra' },
      claude: { command: join(npmModules, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), prefixArgs: [] },
      agy: { command: join(env.LOCALAPPDATA ?? '', 'agy', 'bin', 'agy.exe'), prefixArgs: [] },
    },
  };
}

export function mergeSettings(base, override = {}) {
  return {
    ...base,
    ...override,
    timeouts: { ...base.timeouts, ...override.timeouts },
    agents: Object.fromEntries(Object.entries(base.agents).map(([id, agent]) => [id, { ...agent, ...override.agents?.[id] }])),
  };
}

export function buildInvocation(agentId, mode, prompt, { cwd, settings, outFile }) {
  const agent = settings.agents[agentId];
  if (!agent) throw roomError('AGENT_UNKNOWN', String(agentId));
  if (mode !== 'read' && mode !== 'edit') throw roomError('MODE_INVALID', String(mode));
  const edit = mode === 'edit';
  if (agentId === 'codex') {
    return {
      command: agent.command,
      args: [...agent.prefixArgs, 'exec', '-m', agent.model, '--sandbox', edit ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '-C', cwd, '-o', outFile, '-'],
      stdin: prompt,
      outFile,
    };
  }
  if (agentId === 'claude') {
    return {
      command: agent.command,
      args: [...agent.prefixArgs, '-p', '--permission-mode', edit ? 'acceptEdits' : 'plan', '--disallowedTools', 'PowerShell', ...(edit ? ['--allowedTools', ...CLAUDE_ALLOWED_TOOLS] : [])],
      stdin: prompt,
      outFile: null,
    };
  }
  // agy does not read the prompt from stdin; it must be attached to --print.
  return { command: agent.command, args: [...agent.prefixArgs, '--mode', edit ? 'accept-edits' : 'plan', `--print=${prompt}`], stdin: null, outFile: null };
}

export function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGKILL');
}

export function runTurn(invocation, { cwd, timeoutMs, signal } = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    if (invocation.outFile) rmSync(invocation.outFile, { force: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const child = spawn(invocation.command, invocation.args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (stdout.length < 200_000) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 20_000) stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    const onAbort = () => { aborted = true; killTree(child); };
    if (signal?.aborted) onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      let text = stdout;
      if (invocation.outFile && existsSync(invocation.outFile)) text = readFileSync(invocation.outFile, 'utf8');
      text = text.trim();
      resolve({
        ok: !error && code === 0 && !timedOut && !aborted && text !== '',
        text, stderr: stderr.slice(-2000), error: error?.message ?? null, code, timedOut, aborted, durationMs: Date.now() - started,
      });
    };
    child.on('error', error => finish(null, error));
    child.on('close', code => finish(code, null));
    child.stdin.on('error', () => {});
    child.stdin.end(invocation.stdin ?? '');
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/agents.test.mjs`
Expected: PASS, 6 tests (the SLEEP cases take about 1 s)

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-room/agents.mjs tests/agent-room/agents.test.mjs tests/agent-room/fixtures/fake-cli.mjs
git commit -m "feat(agent-room): CLI invocations per role and turn runner"
```

---

### Task 5: Prompts

**Files:**
- Create: `scripts/agent-room/prompts.mjs`
- Test: `tests/agent-room/prompts.test.mjs`

**Interfaces:**
- Consumes: `AGENT_IDS` (Task 2).
- Produces: `AGENT_NAMES = { codex: 'Codex', claude: 'Claude', agy: 'Antigravity' }`; `MAX_PROMPT_CHARS = 28000`; `rolesOf(agent, roles): string[]`; `transcriptTail(messages, { maxMessages = 20, maxChars = 12000 } = {}): string`.
- Produces: `buildPrompt({ stage, agent, roles, task, planText = '', transcript = [], extra = {} }): string`. Its first line is always `Room stage: <stage>`. Stages: `discuss | roles | plan | build | review | reassign | finish`. `extra` is `{ task }` for `build`, `{ task, diff }` for `review`, and `{ task, reason }` for `reassign`, where `task` is `{ id, title, assignee, description, notes }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/prompts.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PROMPT_CHARS, buildPrompt, rolesOf, transcriptTail } from '../../scripts/agent-room/prompts.mjs';

const roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: 'agy' };
const task = { id: 2, title: 'API', assignee: 'claude', description: 'Add /todos.', notes: '' };

test('transcript tail keeps the newest messages within limits', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ from: i % 2 ? 'claude' : 'room', text: `m${i}` }));
  const tail = transcriptTail(messages);
  assert.equal(tail.split('\n').length, 20);
  assert.ok(tail.endsWith('CLAUDE: m29'));
  assert.ok(tail.startsWith('ROOM: m10'));
  const long = transcriptTail([{ from: 'codex', text: 'old' }, { from: 'agy', text: 'x'.repeat(500) }], { maxChars: 100 });
  assert.ok(long.length <= 100);
  assert.match(long, /^ANTIGRAVITY: x+ \[truncated\]$/);
});

test('roles of an agent', () => {
  assert.deepEqual(rolesOf('agy', roles), ['coder', 'reviewer']);
  assert.deepEqual(rolesOf('codex', null), []);
});

test('each stage prompt names the stage, the agent and its rules', () => {
  const discuss = buildPrompt({ stage: 'discuss', agent: 'claude', roles: null, task: 'Build a to-do app' });
  assert.ok(discuss.startsWith('Room stage: discuss\nYou are Claude (claude)'));
  assert.match(discuss, /\[READY\]/);
  assert.match(discuss, /OWNER TASK:\nBuild a to-do app/);
  assert.match(buildPrompt({ stage: 'roles', agent: 'codex', task: 't' }), /"orchestrator"/);
  const plan = buildPrompt({ stage: 'plan', agent: 'codex', roles, task: 't' });
  assert.match(plan, /roles: orchestrator/);
  assert.match(plan, /Claude \(claude\) can edit files and run only node, npm, npx/);
  const build = buildPrompt({ stage: 'build', agent: 'claude', roles, task: 't', planText: '# Plan', extra: { task: { ...task, notes: 'missing test' } } });
  assert.match(build, /Do ONLY task 2: API/);
  assert.match(build, /not accepted: missing test/);
  assert.match(build, /Do not run git commit/);
  assert.match(build, /PLAN\.md:\n# Plan/);
  assert.match(buildPrompt({ stage: 'review', agent: 'agy', roles, task: 't', extra: { task, diff: '+line' } }), /DIFF:\n\+line/);
  assert.match(buildPrompt({ stage: 'reassign', agent: 'codex', roles, task: 't', extra: { task, reason: 'broke' } }), /"skip"/);
  assert.match(buildPrompt({ stage: 'finish', agent: 'codex', roles, task: 't' }), /Markdown/);
  assert.throws(() => buildPrompt({ stage: 'nope', agent: 'codex', task: 't' }), /Unknown stage/);
});

test('prompts never exceed the Windows-safe limit even with huge inputs', () => {
  const huge = 'y'.repeat(50_000);
  const transcript = Array.from({ length: 50 }, () => ({ from: 'codex', text: huge }));
  const prompt = buildPrompt({
    stage: 'review', agent: 'agy', roles, task: huge, planText: huge, transcript,
    extra: { task: { ...task, description: huge, notes: huge }, diff: huge },
  });
  assert.ok(prompt.length <= MAX_PROMPT_CHARS, String(prompt.length));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/prompts.test.mjs`
Expected: FAIL with `Cannot find module '.../prompts.mjs'`

- [ ] **Step 3: Write the minimal implementation**

```js
// scripts/agent-room/prompts.mjs
import { AGENT_IDS } from './parse.mjs';

export const AGENT_NAMES = { codex: 'Codex', claude: 'Claude', agy: 'Antigravity' };
export const MAX_PROMPT_CHARS = 28_000;

const CAPABILITIES = {
  codex: 'can edit files and run any command inside the project folder',
  claude: 'can edit files and run only node, npm, npx, git status, git diff and git log',
  agy: 'can edit files and run any command inside the project folder',
};

const cap = (text, max) => (String(text).length > max ? `${String(text).slice(0, max)}\n[truncated]` : String(text));

export function rolesOf(agent, roles) {
  if (!roles) return [];
  return [roles.orchestrator === agent && 'orchestrator', roles.coders.includes(agent) && 'coder', roles.reviewer === agent && 'reviewer'].filter(Boolean);
}

export function transcriptTail(messages, { maxMessages = 20, maxChars = 12_000 } = {}) {
  const lines = [];
  let used = 0;
  for (const message of messages.slice(-maxMessages).reverse()) {
    const line = `${message.from === 'room' ? 'ROOM' : AGENT_NAMES[message.from].toUpperCase()}: ${message.text}`;
    if (used + line.length > maxChars) {
      // Keep at least the newest message, cut to fit.
      if (lines.length === 0 && maxChars > 20) lines.unshift(`${line.slice(0, maxChars - 12)} [truncated]`);
      break;
    }
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

function stageRules(stage, agent, roles, extra) {
  const coders = roles?.coders ?? [];
  const team = coders.map(id => `- ${AGENT_NAMES[id]} (${id}) ${CAPABILITIES[id]}`).join('\n');
  switch (stage) {
    case 'discuss':
      return [
        'You are in a planning discussion with two other AI coding agents: Codex (codex), Claude (claude) and Antigravity (agy).',
        "Discuss how to build the owner's task and who should take which role:",
        '- orchestrator: plans the work, assigns tasks, writes the final summary (read-only)',
        '- coder: edits files in the project (one or more agents)',
        "- reviewer: optional, reviews each task's changes (read-only)",
        'One agent may hold several roles. What each agent can do when coding:',
        ...AGENT_IDS.map(id => `- ${AGENT_NAMES[id]} ${CAPABILITIES[id]}`),
        'You are read-only now: do not edit files or run commands that change anything.',
        'Keep your message under 200 words. When you agree with the current proposal, end your message with [READY].',
      ].join('\n');
    case 'roles':
      return 'Write the roles the discussion agreed on (or your best proposal) as one fenced json block and nothing else:\n```json\n{"orchestrator": "codex", "coders": ["claude"], "reviewer": "agy"}\n```\nUse the agent ids codex, claude, agy. reviewer may be null. Do not edit files.';
    case 'plan':
      return `You are the orchestrator. Break the owner's task into 1 to 20 small tasks that coders do one at a time, in order.\nThe coders are:\n${team}\nPlan around what each coder can run. Reply with one fenced json block:\n\`\`\`json\n{"tasks": [{"title": "short title", "assignee": "${coders[0] ?? 'claude'}", "description": "what to do and how to check it"}]}\n\`\`\`\nDo not edit files.`;
    case 'build':
      return [
        `You are a coder. You ${CAPABILITIES[agent]}.`,
        `Do ONLY task ${extra.task.id}: ${extra.task.title}`,
        cap(extra.task.description, 2000),
        extra.task.notes ? `Your previous attempt was not accepted: ${cap(extra.task.notes, 4000)}\nFix that.` : '',
        'Work only inside the current folder. Do not run git commit; the room commits for you.',
        'When you are done, reply with a short summary of what you changed.',
      ].filter(Boolean).join('\n');
    case 'review':
      return `You are the reviewer. Review task ${extra.task.id}: ${extra.task.title}\n${cap(extra.task.description, 2000)}\nDo not edit files. Reply with one fenced json block:\n\`\`\`json\n{"verdict": "ok", "notes": ""}\n\`\`\`\nUse "changes" with clear notes if the task is not done correctly.\n\nDIFF:\n${cap(extra.diff, 8000)}`;
    case 'reassign':
      return `You are the orchestrator. Task ${extra.task.id} (${extra.task.title}) failed twice with ${AGENT_NAMES[extra.task.assignee]}. Last reason: ${cap(extra.reason, 2000)}\nThe coders are:\n${team}\nReply with one fenced json block, either {"action": "reassign", "to": "<coder id>"} with a different coder, or {"action": "skip"}.`;
    case 'finish':
      return 'You are the orchestrator. All tasks are finished or skipped. Write the project summary in Markdown: what was built, how to run it, and what was skipped. Reply with the Markdown only. Do not edit files.';
    default:
      throw new Error(`Unknown stage ${stage}`);
  }
}

export function buildPrompt({ stage, agent, roles, task, planText = '', transcript = [], extra = {} }) {
  const mine = rolesOf(agent, roles);
  const fixed = [
    `Room stage: ${stage}`,
    `You are ${AGENT_NAMES[agent]} (${agent}) in the Ascend Agent Room${mine.length ? `, roles: ${mine.join(', ')}` : ''}.`,
    '',
    stageRules(stage, agent, roles, extra),
    '',
    'OWNER TASK:',
    cap(task, 4000),
    planText ? `\nPLAN.md:\n${cap(planText, 6000)}` : '',
  ].join('\n');
  const budget = Math.max(0, Math.min(12_000, MAX_PROMPT_CHARS - fixed.length - 40));
  const tail = transcriptTail(transcript, { maxChars: budget });
  return tail ? `${fixed}\n\nCONVERSATION SO FAR:\n${tail}` : fixed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/prompts.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-room/prompts.mjs tests/agent-room/prompts.test.mjs
git commit -m "feat(agent-room): stage prompts with size limits"
```

---

### Task 6: Session — discussion, roles and plan gates

**Files:**
- Create: `scripts/agent-room/session.mjs`
- Create: `tests/agent-room/helpers.mjs`
- Test: `tests/agent-room/session-gates.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `TERMINAL: Set<'done' | 'rejected' | 'stopped'>`; `GATES = { 'gate-roles': 'roles', 'gate-plan': 'plan', 'gate-result': 'result' }`.
- Produces: `class RoomSession` with:
  - `static create({ dataDir, settings, runTurn }, { project, task, roles? })` and `static load({ settings, runTurn }, sessionDir)`
  - `state`, `transcript`, `loop: Promise | null`
  - `kick(): Promise | null`, which runs steps until a gate, a pause or a terminal stage
  - `gate({ gate, decision, roles?, plan? }): Promise | null`, `resume({ action, agent? }): Promise | null`, `stop(): Promise<void>`
  - `summary()` → `{ id, project, stage, pause, active, roles }`, and `view()` → state plus the last 200 transcript messages
- State stages: `discuss → roles → gate-roles → plan → gate-plan → build → finish → gate-result → done | rejected`, plus `stopped` at any time. `pause: { reason, at } | null`. `active: { agent, activity, since } | null`.
- Plan tasks carry `{ id, title, assignee, description, status: 'pending' | 'running' | 'review' | 'done' | 'skipped', attempts, reassigned, commit, notes }`.
- This task implements everything except the bodies of `buildStep`, `taskFailed` and `finishStep`, and the full `stop` and `load` behavior. Those go in Task 7, but their stubs must exist.

- [ ] **Step 1: Write the test helpers**

```js
// tests/agent-room/helpers.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function testSettings(buildsRoot) {
  return {
    buildsRoot, maxDiscussTurns: 6, timeouts: { chat: 1000, build: 1000 },
    agents: {
      codex: { command: 'fake-codex', prefixArgs: [], model: 'm' },
      claude: { command: 'fake-claude', prefixArgs: [] },
      agy: { command: 'fake-agy', prefixArgs: [] },
    },
  };
}

export function tempRoom() {
  const base = mkdtempSync(join(tmpdir(), 'ascend-room-session-'));
  return { dataDir: join(base, 'data'), buildsRoot: join(base, 'builds') };
}

export const stageOf = prompt => /^Room stage: (\w+)/.exec(prompt)[1];

// respond({ agent, mode, stage, prompt, cwd, signal }) -> { text, files?, ok?, aborted? } (may be async)
export function fakeRunTurn(respond, calls = []) {
  return async (invocation, { cwd, signal }) => {
    const agent = invocation.command.replace('fake-', '');
    const mode = invocation.args.some(a => ['workspace-write', 'acceptEdits', 'accept-edits'].includes(a)) ? 'edit' : 'read';
    const prompt = invocation.stdin ?? invocation.args.find(a => a.startsWith('--print=')).slice('--print='.length);
    const call = { agent, mode, stage: stageOf(prompt), prompt };
    calls.push(call);
    const reply = await respond({ ...call, cwd, signal });
    for (const [file, content] of Object.entries(reply.files ?? {})) writeFileSync(join(cwd, file), content);
    const ok = reply.ok ?? !reply.aborted;
    return { ok, text: reply.text ?? '', stderr: '', error: null, code: ok ? 0 : 1, timedOut: false, aborted: Boolean(reply.aborted), durationMs: 1 };
  };
}

export const json = value => `Here you go:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
```

- [ ] **Step 2: Write the failing test**

```js
// tests/agent-room/session-gates.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { readJson, readJsonLines } from '../../scripts/agent-room/store.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null };
const PLAN = { tasks: [{ title: 'Scaffold', assignee: 'claude', description: 'Create index.js' }] };

function setup(respond) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const runTurn = fakeRunTurn(respond, calls);
  return { calls, opts: { dataDir, settings: testSettings(buildsRoot), runTurn }, buildsRoot };
}

test('discussion takes turns in order, stops on [READY] from all, then asks Codex for roles', async () => {
  const { calls, opts } = setup(({ agent, stage }) => {
    if (stage === 'discuss') return { text: `${agent} agrees [READY]` };
    if (stage === 'roles') return { text: json(ROLES) };
    throw new Error(`unexpected ${stage}`);
  });
  const session = RoomSession.create(opts, { project: 'todo', task: 'Build a to-do app' });
  await session.kick();
  assert.deepEqual(calls.map(c => `${c.agent}:${c.stage}:${c.mode}`), ['codex:discuss:read', 'claude:discuss:read', 'agy:discuss:read', 'codex:roles:read']);
  assert.equal(session.state.stage, 'gate-roles');
  assert.deepEqual(session.state.roles, ROLES);
  const saved = readJson(join(opts.dataDir, 'sessions', session.state.id, 'state.json'));
  assert.equal(saved.stage, 'gate-roles');
  assert.ok(readJsonLines(join(opts.dataDir, 'sessions', session.state.id, 'transcript.jsonl')).some(m => m.from === 'claude'));
});

test('discussion stops at the turn cap when agents never agree', async () => {
  const { calls, opts } = setup(({ stage }) => (stage === 'discuss' ? { text: 'hmm' } : { text: json(ROLES) }));
  const session = RoomSession.create(opts, { project: 'todo', task: 't' });
  await session.kick();
  assert.equal(calls.filter(c => c.stage === 'discuss').length, 6);
  assert.equal(session.state.stage, 'gate-roles');
});

test('preset roles skip discussion; plan is written, committed and gated', async () => {
  const { calls, opts, buildsRoot } = setup(({ agent, stage }) => {
    assert.equal(agent, 'codex');
    assert.equal(stage, 'plan');
    return { text: json(PLAN) };
  });
  const session = RoomSession.create(opts, { project: 'todo', task: 't', roles: ROLES });
  await session.kick();
  assert.equal(calls.length, 1);
  assert.equal(session.state.stage, 'gate-plan');
  assert.equal(session.state.plan.tasks[0].status, 'pending');
  assert.match(readFileSync(join(buildsRoot, 'todo', 'PLAN.md'), 'utf8'), /1\. \*\*Scaffold\*\* \(claude\)/);
});

test('invalid roles JSON is re-asked once with the error, then pauses', async () => {
  const { calls, opts } = setup(({ stage }) => (stage === 'discuss' ? { text: '[READY]' } : { text: 'no json' }));
  const session = RoomSession.create(opts, { project: 'todo', task: 't' });
  await session.kick();
  const roleCalls = calls.filter(c => c.stage === 'roles');
  assert.equal(roleCalls.length, 2);
  assert.match(roleCalls[1].prompt, /previous answer was rejected: No ```json block/);
  assert.match(session.state.pause.reason, /invalid JSON twice/);
  assert.equal(session.loop, null);
});

test('a failing turn is retried once, then pauses; resume retry continues', async () => {
  let failures = 2;
  const { opts } = setup(({ stage }) => {
    if (stage === 'plan' && failures-- > 0) return { ok: false };
    return { text: json(PLAN) };
  });
  const session = RoomSession.create(opts, { project: 'todo', task: 't', roles: ROLES });
  await session.kick();
  assert.match(session.state.pause.reason, /Codex failed twice/);
  await session.resume({ action: 'retry' });
  assert.equal(session.state.pause, null);
  assert.equal(session.state.stage, 'gate-plan');
});

test('gates validate input and only open at the right stage', async () => {
  const { opts } = setup(({ stage }) => (stage === 'discuss' ? { text: '[READY]' } : stage === 'roles' ? { text: json(ROLES) } : { text: json(PLAN) }));
  const session = RoomSession.create(opts, { project: 'todo', task: 't' });
  await session.kick();
  assert.throws(() => session.gate({ gate: 'plan', decision: 'approve' }), { code: 'GATE_NOT_OPEN' });
  assert.throws(() => session.gate({ gate: 'roles', decision: 'approve', roles: { orchestrator: 'x' } }), { code: 'ROLES_INVALID' });
  await session.gate({ gate: 'roles', decision: 'approve', roles: { orchestrator: 'codex', coders: ['claude'], reviewer: null } });
  assert.equal(session.state.stage, 'gate-plan');
  assert.deepEqual(session.state.roles.coders, ['claude']);
  assert.throws(() => session.gate({ gate: 'plan', decision: 'approve', plan: { tasks: [{ title: 'x', assignee: 'agy', description: '' }] } }), { code: 'PLAN_INVALID' });
});

test('create validates the task and project before touching the disk', () => {
  const { opts, buildsRoot } = setup(() => ({ text: '' }));
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: '' }), { code: 'TASK_INVALID' });
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: 'x'.repeat(4001) }), { code: 'TASK_INVALID' });
  assert.throws(() => RoomSession.create(opts, { project: '../evil', task: 't' }), { code: 'PROJECT_NAME_INVALID' });
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: 't', roles: { orchestrator: 'x' } }), { code: 'ROLES_INVALID' });
  assert.equal(existsSync(buildsRoot), false);
  RoomSession.create(opts, { project: 'todo', task: 't' });
  assert.throws(() => RoomSession.create(opts, { project: 'todo', task: 't' }), { code: 'PROJECT_EXISTS' });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/session-gates.test.mjs`
Expected: FAIL with `Cannot find module '.../session.mjs'`

- [ ] **Step 4: Write the implementation**

```js
// scripts/agent-room/session.mjs
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInvocation, runTurn as realRunTurn } from './agents.mjs';
import { AGENT_IDS, extractJsonBlock, isReady, validatePlan, validateReassign, validateRoles, validateVerdict } from './parse.mjs';
import { resolveProjectDir, roomError } from './paths.mjs';
import { commitAll, createProject, lastCommitDiff, renderPlan, rollback } from './project.mjs';
import { AGENT_NAMES, buildPrompt } from './prompts.mjs';
import { appendJsonLine, readJson, readJsonLines, writeJsonAtomic } from './store.mjs';

export const TERMINAL = new Set(['done', 'rejected', 'stopped']);
export const GATES = { 'gate-roles': 'roles', 'gate-plan': 'plan', 'gate-result': 'result' };

export class RoomSession {
  constructor({ dir, settings, runTurn = realRunTurn, state, transcript }) {
    this.dir = dir;
    this.settings = settings;
    this.runTurn = runTurn;
    this.state = state;
    this.transcript = transcript;
    this.controller = null;
    this.loop = null;
  }

  static create({ dataDir, settings, runTurn }, { project, task, roles } = {}) {
    if (typeof task !== 'string' || !task.trim() || task.length > 4000) throw roomError('TASK_INVALID');
    let presetRoles = null;
    if (roles !== undefined && roles !== null) {
      const checked = validateRoles(roles);
      if (!checked.ok) throw roomError('ROLES_INVALID', checked.error);
      presetRoles = checked.value;
    }
    const projectDir = resolveProjectDir(settings.buildsRoot, project);
    mkdirSync(settings.buildsRoot, { recursive: true });
    createProject(projectDir);
    const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const state = {
      id, project, projectDir, task: task.trim(), stage: presetRoles ? 'plan' : 'discuss', roles: presetRoles,
      plan: null, discussTurns: 0, pause: null, active: null, createdAt: new Date().toISOString(),
    };
    const session = new RoomSession({ dir: join(dataDir, 'sessions', id), settings, runTurn, state, transcript: [] });
    session.save();
    session.say('room', `Session started for project "${project}" in ${projectDir}.`);
    return session;
  }

  static load({ settings, runTurn }, dir) {
    const state = readJson(join(dir, 'state.json'));
    state.active = null;
    const session = new RoomSession({ dir, settings, runTurn, state, transcript: readJsonLines(join(dir, 'transcript.jsonl')) });
    session.save();
    return session;
  }

  save() { writeJsonAtomic(join(this.dir, 'state.json'), this.state); }

  say(from, text) {
    const message = { at: new Date().toISOString(), from, text };
    this.transcript.push(message);
    appendJsonLine(join(this.dir, 'transcript.jsonl'), message);
  }

  summary() {
    const { id, project, stage, pause, active, roles } = this.state;
    return { id, project, stage, pause, active, roles };
  }

  view() { return { ...this.state, transcript: this.transcript.slice(-200) }; }

  setActive(agent, activity) {
    this.state.active = agent ? { agent, activity, since: new Date().toISOString() } : null;
    this.save();
  }

  pauseWith(reason) {
    this.state.pause = { reason, at: new Date().toISOString() };
    this.say('room', `Paused: ${reason}`);
    this.save();
  }

  canRun() {
    return !TERMINAL.has(this.state.stage) && !this.state.pause && !GATES[this.state.stage];
  }

  kick() {
    if (!this.loop && this.canRun()) this.loop = this.run().finally(() => { this.loop = null; });
    return this.loop;
  }

  async run() {
    while (this.canRun()) {
      try {
        await this.step();
      } catch (error) {
        if (this.state.stage !== 'stopped') this.pauseWith(`Room error: ${error.message}`);
      }
    }
  }

  step() {
    switch (this.state.stage) {
      case 'discuss': return this.discussStep();
      case 'roles': return this.rolesStep();
      case 'plan': return this.planStep();
      case 'build': return this.buildStep();
      case 'finish': return this.finishStep();
      default: throw roomError('STAGE_INVALID', this.state.stage);
    }
  }

  prompt(stage, agent, extra = {}) {
    return buildPrompt({
      stage, agent, roles: this.state.roles, task: this.state.task,
      planText: this.state.plan ? renderPlan(this.state.plan.tasks) : '', transcript: this.transcript, extra,
    });
  }

  async turn(agent, mode, prompt, activity) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (this.state.stage === 'stopped') return null;
      this.setActive(agent, activity);
      this.controller = new AbortController();
      const invocation = buildInvocation(agent, mode, prompt, { cwd: this.state.projectDir, settings: this.settings, outFile: join(this.dir, 'codex-last.txt') });
      const timeoutMs = mode === 'edit' ? this.settings.timeouts.build : this.settings.timeouts.chat;
      const result = await this.runTurn(invocation, { cwd: this.state.projectDir, timeoutMs, signal: this.controller.signal });
      this.controller = null;
      if (this.state.stage === 'stopped' || result.aborted) return null;
      this.setActive(null);
      if (result.ok) {
        this.say(agent, result.text);
        return result.text;
      }
      const why = result.timedOut ? 'timed out' : result.error ?? (result.code === 0 ? 'returned no text' : `exited with code ${result.code}`);
      const detail = result.stderr ? ` ${result.stderr.slice(-300)}` : '';
      this.say('room', `${AGENT_NAMES[agent]} turn failed (${why}).${detail}${attempt === 1 ? ' Retrying once.' : ''}`);
    }
    this.pauseWith(`${AGENT_NAMES[agent]} failed twice.`);
    return null;
  }

  parseWith(text, validate) {
    const block = extractJsonBlock(text);
    return block.ok ? validate(block.value) : block;
  }

  async jsonTurn(agent, prompt, activity, validate) {
    let text = await this.turn(agent, 'read', prompt, activity);
    if (text === null) return null;
    let parsed = this.parseWith(text, validate);
    if (parsed.ok) return parsed.value;
    this.say('room', `Invalid answer: ${parsed.error} Asking once more.`);
    text = await this.turn(agent, 'read', `${prompt}\n\nYour previous answer was rejected: ${parsed.error}\nReply again with only the corrected json block.`, activity);
    if (text === null) return null;
    parsed = this.parseWith(text, validate);
    if (parsed.ok) return parsed.value;
    this.pauseWith(`${AGENT_NAMES[agent]} returned invalid JSON twice: ${parsed.error}`);
    return null;
  }

  async discussStep() {
    const state = this.state;
    const agent = AGENT_IDS[state.discussTurns % AGENT_IDS.length];
    const text = await this.turn(agent, 'read', this.prompt('discuss', agent), 'thinking');
    if (text === null) return;
    state.discussTurns += 1;
    const latest = AGENT_IDS.map(id => this.transcript.findLast(m => m.from === id));
    if (state.discussTurns >= this.settings.maxDiscussTurns || latest.every(m => m && isReady(m.text))) state.stage = 'roles';
    this.save();
  }

  async rolesStep() {
    const roles = await this.jsonTurn('codex', this.prompt('roles', 'codex'), 'proposing roles', validateRoles);
    if (!roles) return;
    this.state.roles = roles;
    this.state.stage = 'gate-roles';
    this.save();
    this.say('room', 'Roles proposed. Waiting for the owner.');
  }

  async planStep() {
    const { roles } = this.state;
    const plan = await this.jsonTurn(roles.orchestrator, this.prompt('plan', roles.orchestrator), 'planning', v => validatePlan(v, roles.coders));
    if (!plan) return;
    this.setPlan(plan.tasks, 'plan: initial plan');
    this.state.stage = 'gate-plan';
    this.save();
    this.say('room', 'Plan ready. Waiting for the owner.');
  }

  setPlan(tasks, message) {
    this.state.plan = { tasks: tasks.map(t => ({ ...t, status: 'pending', attempts: 0, reassigned: false, commit: null, notes: '' })) };
    writeFileSync(join(this.state.projectDir, 'PLAN.md'), renderPlan(this.state.plan.tasks), 'utf8');
    const hash = commitAll(this.state.projectDir, message);
    if (hash) this.say('room', `Committed ${hash} "${message}".`);
  }

  // Task 7 replaces these three stubs.
  async buildStep() { throw roomError('NOT_IMPLEMENTED', 'build'); }
  async taskFailed() { throw roomError('NOT_IMPLEMENTED', 'taskFailed'); }
  async finishStep() { throw roomError('NOT_IMPLEMENTED', 'finish'); }

  gate({ gate, decision, roles, plan } = {}) {
    const state = this.state;
    if (GATES[state.stage] !== gate || state.pause) throw roomError('GATE_NOT_OPEN');
    if (gate === 'roles') {
      if (decision !== 'approve') throw roomError('DECISION_INVALID');
      if (roles !== undefined) {
        const checked = validateRoles(roles);
        if (!checked.ok) throw roomError('ROLES_INVALID', checked.error);
        state.roles = checked.value;
      }
      state.stage = 'plan';
      this.say('room', 'Owner approved the roles.');
    } else if (gate === 'plan') {
      if (decision !== 'approve') throw roomError('DECISION_INVALID');
      if (plan !== undefined) {
        const checked = validatePlan(plan, state.roles.coders);
        if (!checked.ok) throw roomError('PLAN_INVALID', checked.error);
        this.setPlan(checked.value.tasks, 'plan: owner edits');
      }
      state.stage = 'build';
      this.say('room', 'Owner approved the plan. Building.');
    } else {
      if (decision !== 'accept' && decision !== 'reject') throw roomError('DECISION_INVALID');
      state.stage = decision === 'accept' ? 'done' : 'rejected';
      this.say('room', `Owner ${decision === 'accept' ? 'accepted' : 'rejected'} the result.`);
    }
    this.save();
    return this.kick();
  }

  resume({ action, agent } = {}) {
    const state = this.state;
    if (!state.pause) throw roomError('NOT_PAUSED');
    if (action === 'stop') return this.stop();
    if (action === 'reassign') {
      const task = state.stage === 'build' ? state.plan?.tasks.find(t => t.status !== 'done' && t.status !== 'skipped') : null;
      if (!task || !state.roles.coders.includes(agent)) throw roomError('REASSIGN_INVALID');
      task.assignee = agent;
      task.attempts = 0;
      task.status = 'pending';
      this.say('room', `Owner reassigned task ${task.id} to ${AGENT_NAMES[agent]}.`);
    } else if (action !== 'retry') {
      throw roomError('ACTION_INVALID');
    }
    state.pause = null;
    this.save();
    return this.kick();
  }

  async stop() {
    if (TERMINAL.has(this.state.stage)) return;
    this.state.stage = 'stopped';
    this.state.pause = null;
    this.state.active = null;
    this.controller?.abort();
    this.say('room', 'Owner stopped the session.');
    this.save();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/session-gates.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-room/session.mjs tests/agent-room/helpers.mjs tests/agent-room/session-gates.test.mjs
git commit -m "feat(agent-room): session discussion, roles and plan gates"
```

---

### Task 7: Session — build, review, reassign, finish, stop and restore

**Files:**
- Modify: `scripts/agent-room/session.mjs` (replace the three stubs and `stop`)
- Test: `tests/agent-room/session-build.test.mjs`

**Interfaces:**
- Consumes: everything from Task 6.
- Produces: the full build behavior:
  - Each task runs: `rollback` → assignee edit turn → `commitAll("task-<id>: <title>")` → optional review.
  - No changes, or a `changes` verdict, counts as a failed attempt. After 2 failed attempts the orchestrator chooses reassign or skip. A task that was already reassigned is skipped automatically.
  - Finish writes `SUMMARY.md`, commits `docs: summary` and moves to `gate-result`.
  - `stop()` aborts the turn, waits for the loop, then rolls back uncommitted files.
  - `RoomSession.load` followed by `kick()` resumes; a `running` task re-runs after rollback, and a `review` task resumes at review.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/session-build.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RoomSession } from '../../scripts/agent-room/session.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const log = dir => spawnSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n').reverse();
const PLAN = { tasks: [{ title: 'One', assignee: 'claude', description: 'a' }, { title: 'Two', assignee: 'agy', description: 'b' }] };

async function toBuild(respond, roles = { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: 'agy' }) {
  const { dataDir, buildsRoot } = tempRoom();
  const calls = [];
  const opts = { dataDir, settings: testSettings(buildsRoot), runTurn: fakeRunTurn(respond, calls) };
  const session = RoomSession.create(opts, { project: 'app', task: 't', roles });
  await session.kick();
  assert.equal(session.state.stage, 'gate-plan');
  return { session, calls, opts, dir: join(buildsRoot, 'app') };
}

test('full happy path: tasks commit in order, reviewer approves, summary, owner accepts', async () => {
  const { session, calls, dir } = await toBuild(({ stage, agent, prompt }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') return { text: 'done', files: { [`${agent}-${/task (\d+)/.exec(prompt)[1]}.txt`]: 'x' } };
    if (stage === 'review') return { text: json({ verdict: 'ok' }) };
    if (stage === 'finish') return { text: '# Summary\nAll good.' };
    throw new Error(stage);
  });
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(session.state.stage, 'gate-result');
  assert.deepEqual(log(dir), ['chore: start project', 'plan: initial plan', 'task-1: One', 'task-2: Two', 'docs: summary']);
  assert.deepEqual(session.state.plan.tasks.map(t => t.status), ['done', 'done']);
  assert.ok(session.state.plan.tasks.every(t => /^[0-9a-f]{7,}$/.test(t.commit)));
  assert.deepEqual(calls.filter(c => c.stage === 'build').map(c => `${c.agent}:${c.mode}`), ['claude:edit', 'agy:edit']);
  assert.ok(calls.filter(c => c.stage === 'review').every(c => c.agent === 'agy' && c.mode === 'read'));
  assert.match(calls.find(c => c.stage === 'review').prompt, /\+x/);
  assert.equal(readFileSync(join(dir, 'SUMMARY.md'), 'utf8'), '# Summary\nAll good.\n');
  await session.gate({ gate: 'result', decision: 'accept' });
  assert.equal(session.state.stage, 'done');
});

test('changes requested: one retry with notes, then orchestrator reassigns, then success', async () => {
  let claudeTries = 0;
  const { session, calls } = await toBuild(({ stage, agent }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') { if (agent === 'claude') claudeTries++; return { text: 'did it', files: { [`f${claudeTries}-${agent}.txt`]: 'x' } }; }
    if (stage === 'review') return { text: json(agent === 'agy' && calls.filter(c => c.stage === 'build').at(-1).agent === 'claude' ? { verdict: 'changes', notes: 'needs tests' } : { verdict: 'ok' }) };
    if (stage === 'reassign') return { text: json({ action: 'reassign', to: 'agy' }) };
    if (stage === 'finish') return { text: 'ok' };
    throw new Error(stage);
  });
  await session.gate({ gate: 'plan', decision: 'approve' });
  const builds = calls.filter(c => c.stage === 'build');
  assert.deepEqual(builds.map(c => c.agent), ['claude', 'claude', 'agy']);
  assert.match(builds[1].prompt, /not accepted: needs tests/);
  assert.equal(session.state.plan.tasks[0].assignee, 'agy');
  assert.equal(session.state.plan.tasks[0].status, 'done');
});

test('no changes twice with a reassigned task means skip without asking again', async () => {
  const { session, calls } = await toBuild(({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') return { text: 'I did nothing' };
    if (stage === 'reassign') return { text: json({ action: 'reassign', to: 'agy' }) };
    if (stage === 'finish') return { text: 'summary' };
    throw new Error(stage);
  }, { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null });
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.equal(calls.filter(c => c.stage === 'reassign').length, 1);
  assert.equal(calls.filter(c => c.stage === 'build').length, 4);
  assert.equal(session.state.plan.tasks[0].status, 'skipped');
  assert.equal(session.state.stage, 'gate-result');
});

test('stop mid-edit kills the turn, rolls back uncommitted files, and runs nothing more', async () => {
  let release;
  const started = new Promise(resolve => { release = resolve; });
  const { session, calls, dir } = await toBuild(({ stage, cwd, signal }) => {
    if (stage === 'plan') return { text: json(PLAN) };
    if (stage === 'build') {
      return new Promise(resolve => {
        import('node:fs').then(fs => fs.writeFileSync(join(cwd, 'half.txt'), 'partial'));
        signal.addEventListener('abort', () => resolve({ aborted: true }));
        release();
      });
    }
    throw new Error(stage);
  });
  const loop = session.gate({ gate: 'plan', decision: 'approve' });
  await started;
  await new Promise(resolve => setTimeout(resolve, 20));
  await session.stop();
  await loop;
  assert.equal(session.state.stage, 'stopped');
  assert.equal(existsSync(join(dir, 'half.txt')), false);
  assert.equal(calls.filter(c => c.stage === 'build').length, 1);
  assert.equal(session.state.active, null);
});

test('restart mid-build: reload rolls back the running task and re-runs it', async () => {
  const respond = ({ stage }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') return { text: 'done', files: { 'good.txt': 'ok' } };
    if (stage === 'finish') return { text: 'summary' };
    throw new Error(stage);
  };
  const { session, opts, dir } = await toBuild(respond, { orchestrator: 'codex', coders: ['claude'], reviewer: null });
  // Simulate a crash during task 1: stage build, task running, stray file on disk.
  session.state.stage = 'build';
  session.state.plan.tasks[0].status = 'running';
  session.state.active = { agent: 'claude', activity: 'editing', since: 'x' };
  session.save();
  const fs = await import('node:fs');
  fs.writeFileSync(join(dir, 'stray.txt'), 'from the crashed turn');
  const calls = [];
  const restored = RoomSession.load({ settings: opts.settings, runTurn: fakeRunTurn(respond, calls) }, session.dir);
  assert.equal(restored.state.active, null);
  await restored.kick();
  assert.equal(existsSync(join(dir, 'stray.txt')), false);
  assert.equal(existsSync(join(dir, 'good.txt')), true);
  assert.equal(restored.state.stage, 'gate-result');
  assert.ok(restored.transcript.length > 3, 'transcript reloaded');
});

test('owner reassign while paused in build changes the assignee and resumes', async () => {
  let claudeFails = true;
  const { session, calls } = await toBuild(({ stage, agent }) => {
    if (stage === 'plan') return { text: json({ tasks: [PLAN.tasks[0]] }) };
    if (stage === 'build') return agent === 'claude' && claudeFails ? { ok: false } : { text: 'done', files: { 'x.txt': 'x' } };
    if (stage === 'finish') return { text: 'summary' };
    throw new Error(stage);
  }, { orchestrator: 'codex', coders: ['claude', 'agy'], reviewer: null });
  await session.gate({ gate: 'plan', decision: 'approve' });
  assert.match(session.state.pause.reason, /Claude failed twice/);
  assert.throws(() => session.resume({ action: 'reassign', agent: 'codex' }), { code: 'REASSIGN_INVALID' });
  claudeFails = false;
  await session.resume({ action: 'reassign', agent: 'agy' });
  assert.equal(calls.filter(c => c.stage === 'build').at(-1).agent, 'agy');
  assert.equal(session.state.stage, 'gate-result');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/session-build.test.mjs`
Expected: FAIL; sessions pause with `Room error: NOT_IMPLEMENTED: build`, so the first assertion on `gate-result` fails.

- [ ] **Step 3: Replace the stubs and `stop` in `scripts/agent-room/session.mjs`**

Replace the three stub lines (`// Task 7 replaces these three stubs.` and the following three methods) with:

```js
  async buildStep() {
    const state = this.state;
    const task = state.plan.tasks.find(t => t.status !== 'done' && t.status !== 'skipped');
    if (!task) {
      state.stage = 'finish';
      this.save();
      return;
    }
    if (task.status !== 'review') {
      rollback(state.projectDir);
      task.status = 'running';
      this.save();
      const text = await this.turn(task.assignee, 'edit', this.prompt('build', task.assignee, { task }), 'editing');
      if (text === null) return;
      const message = `task-${task.id}: ${task.title}`;
      const hash = commitAll(state.projectDir, message);
      if (!hash) return this.taskFailed(task, 'no changes were made');
      task.commit = hash;
      this.say('room', `Committed ${hash} "${message}".`);
      if (!state.roles.reviewer) {
        task.status = 'done';
        this.save();
        return;
      }
      task.status = 'review';
      this.save();
    }
    const reviewer = state.roles.reviewer;
    const verdict = await this.jsonTurn(reviewer, this.prompt('review', reviewer, { task, diff: lastCommitDiff(state.projectDir) }), 'reviewing', validateVerdict);
    if (!verdict) return;
    if (verdict.verdict === 'ok') {
      task.status = 'done';
      this.save();
      return;
    }
    return this.taskFailed(task, verdict.notes || 'the reviewer requested changes');
  }

  async taskFailed(task, reason) {
    task.attempts += 1;
    task.notes = reason;
    this.say('room', `Task ${task.id} attempt ${task.attempts} not accepted: ${reason}`);
    if (task.attempts < 2) {
      task.status = 'pending';
      this.save();
      return;
    }
    if (task.reassigned) {
      task.status = 'skipped';
      this.say('room', `Task ${task.id} skipped: it also failed after reassignment.`);
      this.save();
      return;
    }
    const { roles } = this.state;
    const decision = await this.jsonTurn(roles.orchestrator, this.prompt('reassign', roles.orchestrator, { task, reason }), 'deciding',
      v => validateReassign(v, roles.coders, task.assignee));
    if (!decision) return;
    if (decision.action === 'skip') {
      task.status = 'skipped';
      this.say('room', `Task ${task.id} skipped by the orchestrator.`);
    } else {
      this.say('room', `Task ${task.id} reassigned from ${AGENT_NAMES[task.assignee]} to ${AGENT_NAMES[decision.to]}.`);
      task.assignee = decision.to;
      task.attempts = 0;
      task.notes = '';
      task.reassigned = true;
      task.status = 'pending';
    }
    this.save();
  }

  async finishStep() {
    const orchestrator = this.state.roles.orchestrator;
    const text = await this.turn(orchestrator, 'read', this.prompt('finish', orchestrator), 'summarizing');
    if (text === null) return;
    writeFileSync(join(this.state.projectDir, 'SUMMARY.md'), `${text}\n`, 'utf8');
    const hash = commitAll(this.state.projectDir, 'docs: summary');
    if (hash) this.say('room', `Committed ${hash} "docs: summary".`);
    this.state.stage = 'gate-result';
    this.save();
    this.say('room', 'Work finished. Waiting for the owner to accept or reject.');
  }
```

Replace the whole `async stop()` method with:

```js
  async stop() {
    if (TERMINAL.has(this.state.stage)) return;
    this.state.stage = 'stopped';
    this.state.pause = null;
    this.state.active = null;
    this.controller?.abort();
    this.say('room', 'Owner stopped the session.');
    this.save();
    await this.loop;
    // Committed work stays; anything half-written by the killed turn goes.
    rollback(this.state.projectDir);
  }
```

- [ ] **Step 4: Run both session test files**

Run: `node --no-warnings --test tests/agent-room/session-gates.test.mjs tests/agent-room/session-build.test.mjs`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-room/session.mjs tests/agent-room/session-build.test.mjs
git commit -m "feat(agent-room): build loop with review, reassign, stop and restore"
```

---

### Task 8: Room HTTP server

**Files:**
- Create: `scripts/agent-room/server.mjs`
- Test: `tests/agent-room/server.test.mjs`

**Interfaces:**
- Consumes: `RoomSession`, `TERMINAL` (Tasks 6–7); `buildInvocation`, `defaultSettings`, `mergeSettings`, `runTurn` (Task 4); `AGENT_IDS` (Task 2); `roomDataDir`, `roomError` (Task 1); `readJson`, `writeJsonAtomic` (Task 1).
- Produces: `probeAgent(agentId, settings, runTurn)` → `Promise<{ state: 'ready' } | { state: 'offline', detail }>`.
- Produces: `startRoomServer({ dataDir, settings, runTurn?, probe?, port = 5181, idleMs = 1800000 })` → `Promise<{ port, token, close(): Promise<void>, getSession() }>`. It writes `<dataDir>/server.json` as `{ port, token, pid }` and removes it on close.
- HTTP API (all JSON, all require `Authorization: Bearer <token>`):
  - `GET /status` → `{ online: true, agents: { codex|claude|agy: { state: 'checking'|'ready'|'offline', detail? } }, session: summary|null }`
  - `POST /sessions` with `{ project, task, roles? }` → `201 { session: summary }` | `409 SESSION_ACTIVE | AGENTS_NOT_READY | PROJECT_EXISTS` | `400 <code>`
  - `GET /sessions/current` → `{ session: view|null }`
  - `POST /sessions/current/gate` | `/resume` | `/stop` → `200 { session: summary }` | `404 NO_SESSION` | `400 <code>`
  - Error body: `{ error: <code>, message }`.
- Running `node scripts/agent-room/server.mjs` starts it with Hub-root defaults plus `<dataDir>/settings.json` overrides.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/server.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { startRoomServer } from '../../scripts/agent-room/server.mjs';
import { fakeRunTurn, json, tempRoom, testSettings } from './helpers.mjs';

const ROLES = { orchestrator: 'codex', coders: ['claude'], reviewer: null };

async function boot({ probe = async () => ({ state: 'ready' }), respond } = {}) {
  const { dataDir, buildsRoot } = tempRoom();
  const runTurn = fakeRunTurn(respond ?? (({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] }) } : { text: 'x' })));
  const room = await startRoomServer({ dataDir, settings: testSettings(buildsRoot), runTurn, probe, port: 0 });
  const call = (method, path, body, token = room.token) => fetch(`http://127.0.0.1:${room.port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { room, call, dataDir };
}

test('writes server.json, requires the token, removes server.json on close', async () => {
  const { room, call, dataDir } = await boot();
  const info = JSON.parse(readFileSync(join(dataDir, 'server.json'), 'utf8'));
  assert.equal(info.port, room.port);
  assert.equal(info.token, room.token);
  assert.equal((await call('GET', '/status', undefined, 'wrong')).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${room.port}/status`)).status, 401);
  await room.close();
  assert.equal(existsSync(join(dataDir, 'server.json')), false);
});

test('status reports agent availability and refuses to start until all are ready', async () => {
  const { room, call } = await boot({ probe: async id => (id === 'agy' ? { state: 'offline', detail: 'not signed in' } : { state: 'ready' }) });
  await new Promise(resolve => setTimeout(resolve, 20));
  const status = await (await call('GET', '/status')).json();
  assert.deepEqual(status.agents.agy, { state: 'offline', detail: 'not signed in' });
  assert.equal(status.agents.codex.state, 'ready');
  const res = await call('POST', '/sessions', { project: 'p', task: 't', roles: ROLES });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'AGENTS_NOT_READY');
  await room.close();
});

test('one session at a time; gate, view and stop through the API', async () => {
  const { room, call } = await boot();
  await new Promise(resolve => setTimeout(resolve, 20));
  const created = await call('POST', '/sessions', { project: 'p', task: 't', roles: ROLES });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/sessions', { project: 'q', task: 't' })).status, 409);
  await room.getSession().loop;
  const view = (await (await call('GET', '/sessions/current')).json()).session;
  assert.equal(view.stage, 'gate-plan');
  assert.ok(Array.isArray(view.transcript));
  const badGate = await call('POST', '/sessions/current/gate', { gate: 'roles', decision: 'approve' });
  assert.equal(badGate.status, 400);
  assert.equal((await badGate.json()).error, 'GATE_NOT_OPEN');
  assert.equal((await call('POST', '/sessions/current/stop', {})).status, 200);
  assert.equal(room.getSession().state.stage, 'stopped');
  assert.equal((await call('POST', '/sessions', { project: 'p', task: 't' })).status, 409, 'project folder already exists');
  await room.close();
});

test('rejects bad bodies and unknown routes', async () => {
  const { room, call } = await boot();
  const bad = await fetch(`http://127.0.0.1:${room.port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${room.token}` }, body: '[1]' });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/sessions', { project: 'p', task: 'x'.repeat(70_000) })).status, 413);
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('POST', '/sessions/current/stop', {})).status, 404);
  await room.close();
});

test('restores an unfinished session from disk on start', async () => {
  const { dataDir, buildsRoot } = tempRoom();
  const settings = testSettings(buildsRoot);
  const runTurn = fakeRunTurn(({ stage }) => (stage === 'plan' ? { text: json({ tasks: [{ title: 'A', assignee: 'claude', description: 'd' }] }) } : { text: 'x' }));
  const first = await startRoomServer({ dataDir, settings, runTurn, probe: async () => ({ state: 'ready' }), port: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));
  await fetch(`http://127.0.0.1:${first.port}/sessions`, { method: 'POST', headers: { authorization: `Bearer ${first.token}` }, body: JSON.stringify({ project: 'p', task: 't', roles: ROLES }) });
  await first.getSession().loop;
  await first.close();
  const second = await startRoomServer({ dataDir, settings, runTurn, probe: async () => ({ state: 'ready' }), port: 0 });
  assert.equal(second.getSession().state.stage, 'gate-plan');
  await second.close();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/server.test.mjs`
Expected: FAIL with `Cannot find module '.../server.mjs'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/agent-room/server.mjs
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildInvocation, defaultSettings, mergeSettings, runTurn as realRunTurn } from './agents.mjs';
import { AGENT_IDS } from './parse.mjs';
import { roomDataDir, roomError } from './paths.mjs';
import { RoomSession, TERMINAL } from './session.mjs';
import { readJson, writeJsonAtomic } from './store.mjs';

const PROBE_TTL_MS = 10 * 60_000;
const MAX_BODY = 64 * 1024;

export async function probeAgent(agentId, settings, runTurn = realRunTurn) {
  const cwd = tmpdir();
  const outFile = join(cwd, `ascend-room-probe-${agentId}.txt`);
  const result = await runTurn(buildInvocation(agentId, 'read', 'Reply with exactly: READY', { cwd, settings, outFile }), { cwd, timeoutMs: 120_000 });
  if (result.ok && result.text.includes('READY')) return { state: 'ready' };
  return { state: 'offline', detail: result.timedOut ? 'timed out' : (result.error ?? (result.stderr || result.text || 'no reply')).slice(-200) };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    // Drain an oversized body instead of destroying the socket, so the 413 reply still arrives.
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(roomError('BODY_TOO_LARGE'));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolveBody({});
      try {
        const body = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
        resolveBody(body);
      } catch {
        reject(roomError('BODY_INVALID'));
      }
    });
    req.on('error', reject);
  });
}

function restoreSession(dataDir, settings, runTurn) {
  const sessions = join(dataDir, 'sessions');
  if (!existsSync(sessions)) return null;
  for (const name of readdirSync(sessions).sort().reverse()) {
    const state = readJson(join(sessions, name, 'state.json'));
    if (state && !TERMINAL.has(state.stage)) return RoomSession.load({ settings, runTurn }, join(sessions, name));
  }
  return null;
}

const STATUS_FOR = { BODY_TOO_LARGE: 413, PROJECT_EXISTS: 409 };

export async function startRoomServer({ dataDir, settings, runTurn = realRunTurn, probe, port = 5181, idleMs = 30 * 60_000 }) {
  const probeOne = probe ?? (id => probeAgent(id, settings, runTurn));
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  const agents = Object.fromEntries(AGENT_IDS.map(id => [id, { state: 'checking' }]));
  let probedAt = 0;
  const refreshProbes = () => {
    probedAt = Date.now();
    for (const id of AGENT_IDS) {
      agents[id] = { state: 'checking' };
      probeOne(id).then(result => { agents[id] = result; }, error => { agents[id] = { state: 'offline', detail: error.message }; });
    }
  };
  refreshProbes();

  let session = restoreSession(dataDir, settings, runTurn);
  session?.kick();
  const busy = () => Boolean(session && !TERMINAL.has(session.state.stage));
  let lastRequest = Date.now();

  const server = createServer(async (req, res) => {
    lastRequest = Date.now();
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'UNAUTHORIZED' });
    try {
      const body = req.method === 'POST' ? await readBody(req) : null;
      const route = `${req.method} ${new URL(req.url, 'http://room').pathname}`;
      if (route === 'GET /status') {
        if (Date.now() - probedAt > PROBE_TTL_MS && !busy()) refreshProbes();
        return send(200, { online: true, agents, session: session?.summary() ?? null });
      }
      if (route === 'POST /sessions') {
        if (busy()) return send(409, { error: 'SESSION_ACTIVE', message: 'A session is already running.' });
        const missing = AGENT_IDS.filter(id => agents[id].state !== 'ready');
        if (missing.length) return send(409, { error: 'AGENTS_NOT_READY', message: `Not ready: ${missing.join(', ')}.` });
        session = RoomSession.create({ dataDir, settings, runTurn }, body);
        session.kick();
        return send(201, { session: session.summary() });
      }
      if (route === 'GET /sessions/current') return send(200, { session: session?.view() ?? null });
      if (!['POST /sessions/current/gate', 'POST /sessions/current/resume', 'POST /sessions/current/stop'].includes(route)) return send(404, { error: 'NOT_FOUND' });
      if (!session) return send(404, { error: 'NO_SESSION' });
      if (route === 'POST /sessions/current/gate') session.gate(body);
      else if (route === 'POST /sessions/current/resume') session.resume(body);
      else await session.stop();
      return send(200, { session: session.summary() });
    } catch (error) {
      const status = STATUS_FOR[error.code] ?? (error.code ? 400 : 500);
      return send(status, { error: error.code ?? 'INTERNAL', message: error.message });
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const actualPort = server.address().port;
  const infoFile = join(dataDir, 'server.json');
  writeJsonAtomic(infoFile, { port: actualPort, token, pid: process.pid });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(idleTimer);
    rmSync(infoFile, { force: true });
    await new Promise(resolveClose => server.close(resolveClose));
  };
  const idleTimer = setInterval(() => { if (!busy() && Date.now() - lastRequest > idleMs) void close(); }, 60_000);
  idleTimer.unref();

  return { port: actualPort, token, close, getSession: () => session };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const hubRoot = fileURLToPath(new URL('../../', import.meta.url));
  const dataDir = roomDataDir(hubRoot);
  const settings = mergeSettings(defaultSettings(), readJson(join(dataDir, 'settings.json'), {}));
  const room = await startRoomServer({ dataDir, settings, port: Number(process.env.ASCEND_ROOM_PORT ?? 5181) });
  const shutdown = () => room.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --no-warnings --test tests/agent-room/server.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Run the whole room suite**

Run: `node --no-warnings --test tests/agent-room/*.test.mjs`
Expected: PASS, all room tests (45 so far)

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-room/server.mjs tests/agent-room/server.test.mjs
git commit -m "feat(agent-room): local HTTP room server with token and restore"
```

---

### Task 9: Hub proxy and API routes

**Files:**
- Create: `app/room/room-proxy.ts`
- Create: `app/api/room/route.ts`
- Create: `app/api/room/start-server/route.ts`
- Create: `app/api/room/sessions/route.ts`
- Create: `app/api/room/sessions/current/route.ts`
- Create: `app/api/room/sessions/current/gate/route.ts`
- Create: `app/api/room/sessions/current/resume/route.ts`
- Create: `app/api/room/sessions/current/stop/route.ts`
- Test: `tests/agent-room/room-proxy.test.ts`

**Interfaces:**
- Consumes: the room HTTP API and `server.json` format (Task 8).
- Produces: `roomDataDir(cwd = process.cwd())`; `readServerInfo(dir?)` → `{ port, token, pid } | null`; `forwardToRoom(path, { method?, body? } = {}, dir?)` → `Promise<Response>` (the room's status and body, or `503 { online: false }`); `readCommand(request)` → `Promise<{ body } | { error: Response }>` (origin must match, at most 16 KB, a JSON object); `startRoomServer(cwd = process.cwd())` → `Promise<Response>` (`200 { started: false }` if already online, else spawns detached and returns `202 { started: true }`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/agent-room/room-proxy.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { forwardToRoom, readCommand, readServerInfo } from "../../app/room/room-proxy";

function dataDirWith(info: unknown) {
  const dir = join(mkdtempSync(join(tmpdir(), "ascend-room-proxy-")), "agent-room");
  mkdirSync(dir, { recursive: true });
  if (info !== undefined) writeFileSync(join(dir, "server.json"), JSON.stringify(info));
  return dir;
}

test("offline when server.json is missing, malformed, or the port is dead", async () => {
  assert.equal(readServerInfo(dataDirWith(undefined)), null);
  assert.equal(readServerInfo(dataDirWith({ port: "x", token: 1 })), null);
  const res = await forwardToRoom("/status", {}, dataDirWith({ port: 1, token: "t", pid: 1 }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { online: false });
});

test("forwards method, body and bearer token, and passes status through", async () => {
  const seen: { auth?: string; method?: string; body?: string; url?: string } = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      Object.assign(seen, { auth: req.headers.authorization, method: req.method, body, url: req.url });
      res.writeHead(409, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "SESSION_ACTIVE" }));
    });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const res = await forwardToRoom("/sessions", { method: "POST", body: { project: "p" } }, dataDirWith({ port, token: "secret", pid: 1 }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "SESSION_ACTIVE" });
  assert.deepEqual(seen, { auth: "Bearer secret", method: "POST", body: '{"project":"p"}', url: "/sessions" });
  server.close();
});

test("readCommand enforces same origin, size and object shape", async () => {
  const req = (body: string, origin = "http://localhost:5173") =>
    new Request("http://localhost:5173/api/room/sessions", { method: "POST", headers: { origin }, body });
  assert.deepEqual(await readCommand(req('{"a":1}')), { body: { a: 1 } });
  assert.deepEqual(await readCommand(req("")), { body: {} });
  const cross = await readCommand(req("{}", "http://evil.test"));
  assert.ok("error" in cross && cross.error.status === 403);
  const big = await readCommand(req(JSON.stringify({ t: "x".repeat(17_000) })));
  assert.ok("error" in big && big.error.status === 413);
  const arr = await readCommand(req("[1]"));
  assert.ok("error" in arr && arr.error.status === 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx --no-install tsx --test tests/agent-room/room-proxy.test.ts`
Expected: FAIL with `Cannot find module '../../app/room/room-proxy'`

- [ ] **Step 3: Write the proxy**

```ts
// app/room/room-proxy.ts
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type ServerInfo = { port: number; token: string; pid: number };

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" };

export function roomDataDir(cwd = process.cwd()) {
  return join(cwd, ".sites-runtime", "agent-room");
}

export function readServerInfo(dir = roomDataDir()): ServerInfo | null {
  try {
    const info = JSON.parse(readFileSync(join(dir, "server.json"), "utf8"));
    return Number.isInteger(info.port) && typeof info.token === "string" ? info : null;
  } catch {
    return null;
  }
}

export async function forwardToRoom(path: string, init: { method?: string; body?: unknown } = {}, dir?: string): Promise<Response> {
  const info = readServerInfo(dir);
  if (!info) return Response.json({ online: false }, { status: 503, headers: NO_STORE });
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return new Response(await res.text(), { status: res.status, headers: NO_STORE });
  } catch {
    return Response.json({ online: false }, { status: 503, headers: NO_STORE });
  }
}

export async function readCommand(request: Request): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { error: Response.json({ error: "ORIGIN_MISMATCH" }, { status: 403 }) };
  const text = await request.text();
  if (text.length > 16_384) return { error: Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 }) };
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return { body };
  } catch {}
  return { error: Response.json({ error: "BODY_INVALID" }, { status: 400 }) };
}

export async function startRoomServer(cwd = process.cwd()): Promise<Response> {
  const status = await forwardToRoom("/status", {}, roomDataDir(cwd));
  if (status.ok) return Response.json({ started: false });
  const child = spawn(process.execPath, [join(cwd, "scripts", "agent-room", "server.mjs")], {
    cwd, detached: true, stdio: "ignore", windowsHide: true,
  });
  child.unref();
  return Response.json({ started: true }, { status: 202 });
}
```

- [ ] **Step 4: Write the seven route handlers**

```ts
// app/api/room/route.ts
import { forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET() {
  return forwardToRoom("/status");
}
```

```ts
// app/api/room/start-server/route.ts
import { readCommand, startRoomServer } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return startRoomServer();
}
```

```ts
// app/api/room/sessions/route.ts
import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/sessions", { method: "POST", body: command.body });
}
```

```ts
// app/api/room/sessions/current/route.ts
import { forwardToRoom } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export function GET() {
  return forwardToRoom("/sessions/current");
}
```

```ts
// app/api/room/sessions/current/gate/route.ts
import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/sessions/current/gate", { method: "POST", body: command.body });
}
```

```ts
// app/api/room/sessions/current/resume/route.ts
import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/sessions/current/resume", { method: "POST", body: command.body });
}
```

```ts
// app/api/room/sessions/current/stop/route.ts
import { forwardToRoom, readCommand } from "@/app/room/room-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const command = await readCommand(request);
  if ("error" in command) return command.error;
  return forwardToRoom("/sessions/current/stop", { method: "POST", body: command.body });
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx --no-install tsx --test tests/agent-room/room-proxy.test.ts`
Expected: PASS, 3 tests

Run: `npx --no-install tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/room/room-proxy.ts app/api/room tests/agent-room/room-proxy.test.ts
git commit -m "feat(agent-room): Hub API routes proxying to the room process"
```

---

### Task 10: The `/room` page

**Files:**
- Create: `app/room/room-types.ts`
- Create: `app/room/room-parts.tsx`
- Create: `app/room/page.tsx`
- Create: `app/room/room.css`
- Modify: `app/layout.tsx` (add one CSS import after line 3)

**Interfaces:**
- Consumes: the Hub API from Task 9 (`GET /api/room`, `GET /api/room/sessions/current`, and the POST routes).
- Produces: the `/room` page. Exported UI pieces: `Crt`, `StageSteps`, `Transcript`, `TaskBoard`, `BriefForm`, `GateBar`.

- [ ] **Step 1: Write the shared types**

```ts
// app/room/room-types.ts
export type AgentId = "codex" | "claude" | "agy";
export const AGENT_IDS: AgentId[] = ["codex", "claude", "agy"];
export const AGENT_NAMES: Record<AgentId, string> = { codex: "Codex", claude: "Claude", agy: "Antigravity" };

export type Roles = { orchestrator: AgentId; coders: AgentId[]; reviewer: AgentId | null };
export const DEFAULT_ROLES: Roles = { orchestrator: "codex", coders: ["claude", "agy"], reviewer: null };

export type Stage = "discuss" | "roles" | "gate-roles" | "plan" | "gate-plan" | "build" | "finish" | "gate-result" | "done" | "rejected" | "stopped";
export const TERMINAL_STAGES: Stage[] = ["done", "rejected", "stopped"];
export const BOARD_STAGES: Stage[] = ["build", "finish", "gate-result", "done", "rejected", "stopped"];

export type TaskStatus = "pending" | "running" | "review" | "done" | "skipped";
export type PlanTask = { id: number; title: string; assignee: AgentId; description: string; status: TaskStatus; attempts: number; commit: string | null; notes: string };
export type Message = { at: string; from: AgentId | "room"; text: string };
export type Availability = { state: "checking" | "ready" | "offline"; detail?: string };
export type RoomStatus = { online: true; agents: Record<AgentId, Availability> };

export type SessionView = {
  id: string;
  project: string;
  projectDir: string;
  task: string;
  stage: Stage;
  roles: Roles | null;
  plan: { tasks: PlanTask[] } | null;
  pause: { reason: string; at: string } | null;
  active: { agent: AgentId; activity: string; since: string } | null;
  transcript: Message[];
};

export function rolesOf(agent: AgentId, roles: Roles | null): string[] {
  if (!roles) return [];
  return [
    roles.orchestrator === agent ? "orchestrator" : null,
    roles.coders.includes(agent) ? "coder" : null,
    roles.reviewer === agent ? "reviewer" : null,
  ].filter((role): role is string => role !== null);
}
```

- [ ] **Step 2: Write the UI parts**

```tsx
// app/room/room-parts.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import {
  AGENT_IDS, AGENT_NAMES, DEFAULT_ROLES, rolesOf,
  type AgentId, type Availability, type Message, type PlanTask, type Roles, type SessionView, type Stage,
} from "./room-types";

export type Act = (path: string, body?: unknown) => Promise<void>;

const GATE = "/api/room/sessions/current/gate";
const RESUME = "/api/room/sessions/current/resume";

const STEPS: { label: string; stages: Stage[] }[] = [
  { label: "Discuss", stages: ["discuss", "roles"] },
  { label: "Roles", stages: ["gate-roles"] },
  { label: "Plan", stages: ["plan", "gate-plan"] },
  { label: "Build", stages: ["build"] },
  { label: "Finish", stages: ["finish", "gate-result"] },
  { label: "Done", stages: ["done", "rejected", "stopped"] },
];

export function Crt({ id, availability, session }: { id: AgentId; availability?: Availability; session: SessionView | null }) {
  const active = session?.active ?? null;
  const busy = active?.agent === id;
  const status = availability?.state === "offline" ? "offline · not signed in"
    : availability?.state !== "ready" ? "checking…"
      : busy && active ? `${active.activity}…` : "idle";
  return (
    <div className={`agent-room-crt agent-room-${id}${busy ? " is-busy" : ""}`}>
      <b>{AGENT_NAMES[id]}</b>
      <span className="agent-room-badges">
        {rolesOf(id, session?.roles ?? null).map(role => <span key={role} className="agent-room-badge">{role}</span>)}
      </span>
      <span className="agent-room-crt-status" aria-live="polite" title={availability?.detail}>{status}</span>
    </div>
  );
}

export function StageSteps({ stage, paused }: { stage: Stage; paused: boolean }) {
  return (
    <ol className="agent-room-steps" aria-label="Session stage">
      {STEPS.map(step => {
        const current = step.stages.includes(stage);
        const label = current && step.label === "Done" ? stage : step.label;
        return (
          <li key={step.label} className={current ? "is-current" : undefined} aria-current={current ? "step" : undefined}>
            {label}{current && paused ? " · paused" : ""}
          </li>
        );
      })}
    </ol>
  );
}

export function Transcript({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);
  return (
    <div ref={ref} className="agent-room-log" role="log" aria-label="Transcript">
      {messages.map((m, i) => (
        <p key={`${m.at}-${i}`} className={m.from === "room" ? "is-room" : undefined}>
          <b className={m.from === "room" ? undefined : `agent-room-name-${m.from}`}>{m.from === "room" ? "ROOM" : AGENT_NAMES[m.from]}:</b> {m.text}
        </p>
      ))}
    </div>
  );
}

export function TaskBoard({ tasks }: { tasks: PlanTask[] }) {
  return (
    <aside className="agent-room-board" aria-label="Plan tasks">
      <h2>Plan</h2>
      <ol>
        {tasks.map(t => (
          <li key={t.id} className={`is-${t.status}`}>
            <span>{t.id}. {t.title}</span>
            <small>{AGENT_NAMES[t.assignee]} · {t.status}{t.attempts ? ` · retry ${t.attempts}` : ""}{t.commit ? ` · ${t.commit}` : ""}</small>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function AgentSelect({ value, options, label, onChange }: { value: AgentId; options: AgentId[]; label: string; onChange: (id: AgentId) => void }) {
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value as AgentId)}>
      {options.map(id => <option key={id} value={id}>{AGENT_NAMES[id]}</option>)}
    </select>
  );
}

export function RolesEditor({ value, onChange }: { value: Roles; onChange: (roles: Roles) => void }) {
  const toggleCoder = (id: AgentId) =>
    onChange({ ...value, coders: value.coders.includes(id) ? value.coders.filter(c => c !== id) : [...value.coders, id] });
  return (
    <fieldset className="agent-room-roles">
      <legend>Roles</legend>
      <label>Orchestrator <AgentSelect label="Orchestrator" value={value.orchestrator} options={AGENT_IDS} onChange={orchestrator => onChange({ ...value, orchestrator })} /></label>
      <span>Coders {AGENT_IDS.map(id => (
        <label key={id}><input type="checkbox" checked={value.coders.includes(id)} onChange={() => toggleCoder(id)} /> {AGENT_NAMES[id]}</label>
      ))}</span>
      <label>Reviewer{" "}
        <select aria-label="Reviewer" value={value.reviewer ?? ""} onChange={e => onChange({ ...value, reviewer: (e.target.value || null) as AgentId | null })}>
          <option value="">None</option>
          {AGENT_IDS.map(id => <option key={id} value={id}>{AGENT_NAMES[id]}</option>)}
        </select>
      </label>
    </fieldset>
  );
}

export function BriefForm({ agents, act }: { agents?: Record<AgentId, Availability>; act: Act }) {
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [ownRoles, setOwnRoles] = useState(false);
  const [roles, setRoles] = useState<Roles>(DEFAULT_ROLES);
  const missing = AGENT_IDS.filter(id => agents?.[id]?.state !== "ready");
  return (
    <form className="agent-room-brief" onSubmit={e => { e.preventDefault(); void act("/api/room/sessions", { project, task, ...(ownRoles ? { roles } : {}) }); }}>
      <label>Project name
        <input value={project} onChange={e => setProject(e.target.value)} pattern="[a-z0-9][a-z0-9\-]{0,39}" required placeholder="todo-system" />
      </label>
      <small>Built in D:\ascend-builds\{project || "<name>"} as its own git repository.</small>
      <label>What should they build?
        <textarea value={task} onChange={e => setTask(e.target.value)} maxLength={4000} required rows={4} />
      </label>
      <label><input type="checkbox" checked={ownRoles} onChange={e => setOwnRoles(e.target.checked)} /> Set roles myself (skip the discussion)</label>
      {ownRoles && <RolesEditor value={roles} onChange={setRoles} />}
      <button type="submit" disabled={missing.length > 0}>Start</button>
      {missing.length > 0 && <p className="agent-room-hint">Waiting for: {missing.map(id => AGENT_NAMES[id]).join(", ")}</p>}
    </form>
  );
}

function RolesGate({ initial, act }: { initial: Roles; act: Act }) {
  const [roles, setRoles] = useState(initial);
  return (
    <div className="agent-room-gate">
      <p>The agents proposed these roles. Edit them or approve.</p>
      <RolesEditor value={roles} onChange={setRoles} />
      <button onClick={() => act(GATE, { gate: "roles", decision: "approve", roles })}>Approve roles</button>
    </div>
  );
}

function PlanGate({ tasks, coders, act }: { tasks: PlanTask[]; coders: AgentId[]; act: Act }) {
  const [draft, setDraft] = useState(tasks.map(t => ({ title: t.title, assignee: t.assignee, description: t.description })));
  const update = (index: number, patch: Partial<(typeof draft)[number]>) => setDraft(d => d.map((t, j) => (j === index ? { ...t, ...patch } : t)));
  return (
    <div className="agent-room-gate">
      <p>Review the plan. You can change titles and assignees.</p>
      <ol className="agent-room-plan-edit">
        {draft.map((t, i) => (
          <li key={i}>
            <input aria-label={`Task ${i + 1} title`} value={t.title} maxLength={120} onChange={e => update(i, { title: e.target.value })} />
            <AgentSelect label={`Task ${i + 1} assignee`} value={t.assignee} options={coders} onChange={assignee => update(i, { assignee })} />
            <p>{t.description}</p>
          </li>
        ))}
      </ol>
      <button onClick={() => act(GATE, { gate: "plan", decision: "approve", plan: { tasks: draft } })}>Approve plan</button>
    </div>
  );
}

function PausePanel({ session, act }: { session: SessionView; act: Act }) {
  const coders = session.roles?.coders ?? [];
  const [agent, setAgent] = useState<AgentId>(coders[0] ?? "claude");
  return (
    <div className="agent-room-gate" role="alert">
      <p>Paused: {session.pause?.reason}</p>
      <button onClick={() => act(RESUME, { action: "retry" })}>Retry</button>
      {session.stage === "build" && coders.length > 0 && (
        <>
          <AgentSelect label="Reassign to" value={agent} options={coders} onChange={setAgent} />
          <button onClick={() => act(RESUME, { action: "reassign", agent })}>Reassign</button>
        </>
      )}
      <button onClick={() => act(RESUME, { action: "stop" })}>Stop</button>
    </div>
  );
}

export function GateBar({ session, act }: { session: SessionView; act: Act }) {
  if (session.pause) return <PausePanel session={session} act={act} />;
  if (session.stage === "gate-roles" && session.roles) return <RolesGate key={session.id} initial={session.roles} act={act} />;
  if (session.stage === "gate-plan" && session.plan) return <PlanGate key={session.id} tasks={session.plan.tasks} coders={session.roles?.coders ?? []} act={act} />;
  if (session.stage === "gate-result") {
    return (
      <div className="agent-room-gate">
        <p>Work finished in <code>{session.projectDir}</code>. See SUMMARY.md there.</p>
        <button onClick={() => act(GATE, { gate: "result", decision: "accept" })}>Accept</button>
        <button onClick={() => act(GATE, { gate: "result", decision: "reject" })}>Reject</button>
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 3: Write the page**

```tsx
// app/room/page.tsx
"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BriefForm, Crt, GateBar, StageSteps, TaskBoard, Transcript } from "./room-parts";
import { AGENT_IDS, BOARD_STAGES, TERMINAL_STAGES, type RoomStatus, type SessionView } from "./room-types";

function useRoom() {
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, sessionRes] = await Promise.all([
        fetch("/api/room", { cache: "no-store" }),
        fetch("/api/room/sessions/current", { cache: "no-store" }),
      ]);
      if (!statusRes.ok) { setOffline(true); return; }
      setOffline(false);
      setStatus(await statusRes.json());
      if (sessionRes.ok) setSession((await sessionRes.json()).session ?? null);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await refresh();
      if (alive) timer = setTimeout(tick, document.hidden ? 10_000 : 1_500);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [refresh]);

  const send = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    await refresh();
    return res.ok ? null : String(data.message ?? data.error ?? `Request failed (${res.status})`);
  }, [refresh]);

  return { status, session, offline, send };
}

export default function RoomPage() {
  const { status, session, offline, send } = useRoom();
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(async (path: string, body?: unknown) => setError(await send(path, body)), [send]);
  const running = Boolean(session && !TERMINAL_STAGES.includes(session.stage));
  const showBoard = Boolean(session?.plan && BOARD_STAGES.includes(session.stage));

  return (
    <main className="agent-room">
      <header className="agent-room-bar">
        <Link href="/" className="agent-room-back">◂ Shelf</Link>
        <span>AGENT ROOM{session ? ` · ${session.project}` : ""}</span>
        {running && <button className="agent-room-stop" onClick={() => act("/api/room/sessions/current/stop")}>Stop</button>}
      </header>
      {offline ? (
        <div className="agent-room-offline">
          <p>Room offline.</p>
          <button onClick={() => act("/api/room/start-server")}>Start room</button>
        </div>
      ) : (
        <>
          <section className="agent-room-crts" aria-label="Agents">
            {AGENT_IDS.map(id => <Crt key={id} id={id} availability={status?.agents[id]} session={session} />)}
          </section>
          <div className={`agent-room-body${showBoard ? " has-board" : ""}`}>
            <div className="agent-room-main">
              {session && <StageSteps stage={session.stage} paused={Boolean(session.pause)} />}
              {session && <Transcript messages={session.transcript} />}
              {session && <GateBar session={session} act={act} />}
              {!running && <BriefForm agents={status?.agents} act={act} />}
              {error && <p role="alert" className="agent-room-error">{error}</p>}
            </div>
            {showBoard && session?.plan && <TaskBoard tasks={session.plan.tasks} />}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Write the styles and import them**

```css
/* app/room/room.css */
.agent-room { --room-ink: #2b2118; --room-paper: #f3e6cf; --room-card: #fffaf0; --room-accent: #ffd27a;
  min-height: 100vh; background: #1a120c; color: var(--room-ink); font-family: ui-monospace, Consolas, monospace; padding: 16px; box-sizing: border-box; }
.agent-room-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--room-ink); color: var(--room-paper);
  border: 2px solid #000; border-radius: 6px 6px 0 0; padding: 8px 12px; }
.agent-room-back { color: var(--room-paper); text-decoration: none; }
.agent-room-back:focus-visible, .agent-room button:focus-visible, .agent-room input:focus-visible,
.agent-room select:focus-visible, .agent-room textarea:focus-visible { outline: 3px solid var(--room-accent); outline-offset: 2px; }
.agent-room button { font: inherit; padding: 4px 12px; border: 2px solid var(--room-ink); border-radius: 4px; background: var(--room-accent); color: var(--room-ink); cursor: pointer; }
.agent-room button:disabled { opacity: .5; cursor: not-allowed; }
.agent-room-stop { background: #ff6b6b; }
.agent-room-crts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; background: var(--room-paper); padding: 12px;
  border-inline: 2px solid #000; }
.agent-room-crt { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px; border-radius: 14px; background: #141414;
  color: #e9e9e9; border: 3px solid var(--room-ink); box-shadow: inset 0 0 0 3px var(--crt-color), inset 0 0 24px #0008; text-align: center; }
.agent-room-codex { --crt-color: #e28a2b; } .agent-room-claude { --crt-color: #d97757; } .agent-room-agy { --crt-color: #3d7bff; }
.agent-room-crt.is-busy { box-shadow: inset 0 0 0 3px var(--crt-color), 0 0 18px var(--crt-color); animation: agent-room-glow 1.4s ease-in-out infinite alternate; }
@keyframes agent-room-glow { to { box-shadow: inset 0 0 0 3px var(--crt-color), 0 0 4px var(--crt-color); } }
.agent-room-badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; min-height: 18px; }
.agent-room-badge { background: var(--room-paper); color: var(--room-ink); border-radius: 3px; padding: 1px 6px; font-size: 11px; text-transform: uppercase; }
.agent-room-crt-status { font-size: 12px; color: #9fe8b0; }
.agent-room-body { display: grid; grid-template-columns: 1fr; gap: 12px; background: var(--room-paper); padding: 12px; border: 2px solid #000; border-top: 0; border-radius: 0 0 6px 6px; }
.agent-room-body.has-board { grid-template-columns: minmax(0, 1fr) 280px; }
.agent-room-main { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.agent-room-steps { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.agent-room-steps li { border: 1px solid var(--room-ink); border-radius: 3px; padding: 2px 8px; }
.agent-room-steps li.is-current { background: var(--room-ink); color: var(--room-paper); }
.agent-room-log { background: var(--room-card); border: 1px solid var(--room-ink); border-radius: 4px; padding: 8px; max-height: 50vh; overflow-y: auto; }
.agent-room-log p { margin: 0 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.agent-room-log p.is-room { color: #6b5a48; font-style: italic; }
.agent-room-name-codex { color: #b0611a; } .agent-room-name-claude { color: #b4532f; } .agent-room-name-agy { color: #2a5bd0; }
.agent-room-board { background: var(--room-card); border: 1px solid var(--room-ink); border-radius: 4px; padding: 8px; }
.agent-room-board h2 { font-size: 14px; margin: 0 0 6px; }
.agent-room-board ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.agent-room-board li { display: flex; flex-direction: column; border: 1px solid var(--room-ink); border-radius: 3px; padding: 4px 6px; }
.agent-room-board li.is-running, .agent-room-board li.is-review { background: var(--room-accent); }
.agent-room-board li.is-done { opacity: .75; } .agent-room-board li.is-skipped { text-decoration: line-through; opacity: .6; }
.agent-room-gate, .agent-room-brief, .agent-room-offline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; background: var(--room-card);
  border: 2px solid var(--room-ink); border-radius: 4px; padding: 10px; }
.agent-room-gate > p, .agent-room-brief > label, .agent-room-brief > small, .agent-room-plan-edit { flex-basis: 100%; margin: 0; }
.agent-room-brief label { display: flex; flex-direction: column; gap: 4px; }
.agent-room-brief input, .agent-room-brief textarea, .agent-room select, .agent-room-plan-edit input { font: inherit; border: 1px solid var(--room-ink); border-radius: 3px; padding: 4px; background: #fff; }
.agent-room-roles { display: flex; flex-wrap: wrap; gap: 12px; border: 1px dashed var(--room-ink); flex-basis: 100%; }
.agent-room-plan-edit { padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
.agent-room-plan-edit p { margin: 4px 0 0; font-size: 12px; }
.agent-room-hint { margin: 0; font-size: 12px; } .agent-room-error { margin: 0; color: #b00020; }
.agent-room-offline { margin-top: 12px; }
@media (max-width: 720px) {
  .agent-room-crts { grid-template-columns: 1fr; }
  .agent-room-body.has-board { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-room-crt.is-busy { animation: none; }
}
```

In `app/layout.tsx`, after `import "@/components/status/tv-inspector.css";` add:

```ts
import "./room/room.css";
```

- [ ] **Step 5: Type check, lint and build**

Run: `npx --no-install tsc --noEmit`
Expected: no errors

Run: `npx --no-install eslint app/room app/api/room`
Expected: no errors

Run: `npm run build`
Expected: the build succeeds and lists the `/room` route

- [ ] **Step 6: Commit**

```bash
git add app/room app/layout.tsx
git commit -m "feat(agent-room): room page with CRTs, transcript, gates and task board"
```

---

### Task 11: The poster opens the room

**Files:**
- Modify: `app/page.tsx` (the `slot.isPoster` branch, around lines 1817–1833)
- Modify: `app/globals.css` (after the `.framed-poster:hover` rule, around line 419)
- Test: `tests/agent-room/poster-link.test.mjs`

**Interfaces:**
- Consumes: `Link` (already imported at `app/page.tsx:3`) and the `edit` flag in scope (used at `app/page.tsx:1838`).
- Produces: outside edit mode, clicking the poster navigates to `/room`; in edit mode the click does nothing.

- [ ] **Step 1: Write the failing test**

```js
// tests/agent-room/poster-link.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

test('the framed poster links to the agent room with an accessible name', () => {
  const poster = page.slice(page.indexOf('slot.isPoster ?'), page.indexOf('framed-poster-art'));
  assert.match(poster, /<Link/);
  assert.match(poster, /href="\/room"/);
  assert.match(poster, /aria-label="Enter the agent room"/);
  assert.match(poster, /if \(edit\) event\.preventDefault\(\)/);
});

test('the poster has a visible keyboard focus ring', () => {
  assert.match(css, /\.framed-poster:focus-visible\s*\{[^}]*outline:\s*3px solid/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --no-warnings --test tests/agent-room/poster-link.test.mjs`
Expected: FAIL; no `<Link` in the poster branch

- [ ] **Step 3: Change the poster element**

In `app/page.tsx`, replace:

```tsx
                                      ) : slot.isPoster ? (
                                        <div
                                          className="framed-poster"
```

with:

```tsx
                                      ) : slot.isPoster ? (
                                        <Link
                                          href="/room"
                                          aria-label="Enter the agent room"
                                          className="framed-poster"
                                          draggable={false}
                                          onClick={event => { if (edit) event.preventDefault(); }}
```

Then, in the same branch, replace the closing tag that follows the `framed-poster-art` block:

```tsx
                                          </div>
                                        </div>
                                      ) : (
```

with:

```tsx
                                          </div>
                                        </Link>
                                      ) : (
```

Leave the `onPointerMove` and `onPointerLeave` handlers between them unchanged.

In `app/globals.css`, after the `.framed-poster:hover { … }` rule, add:

```css
a.framed-poster { display: block; color: inherit; cursor: pointer; }
.framed-poster:focus-visible { outline: 3px solid #ffd27a; outline-offset: 4px; }
```

- [ ] **Step 4: Run the tests, type check and lint**

Run: `node --no-warnings --test tests/agent-room/poster-link.test.mjs`
Expected: PASS, 2 tests

Run: `npx --no-install tsc --noEmit`
Expected: no errors (`onPointerMove` on `Link` types as an anchor handler)

Run: `npx --no-install eslint app/page.tsx`
Expected: the same error count as before this change (`git stash` the change and compare if it differs)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/globals.css tests/agent-room/poster-link.test.mjs
git commit -m "feat(agent-room): shelf poster opens the agent room"
```

---

### Task 12: Full checks, live run and handoff

**Files:**
- Modify: `ASCEND_HANDOFF.md` (the Current session section, plus one line under Ascend Hub's key paths)

- [ ] **Step 1: Run every check**

Run each from `D:\ascend_hub`:

```bash
node --no-warnings --test tests/agent-room/*.test.mjs
npx --no-install tsx --test tests/agent-room/room-proxy.test.ts
npm run test:status
node --no-warnings --test tests/phase3/*.test.mjs
npx --no-install tsc --noEmit
npx --no-install eslint scripts/agent-room app/room app/api/room tests/agent-room
npm run build
git diff --check main
```

Expected: everything passes. Record the counts. If `npm run lint` is run in full, it still reports only the pre-existing errors.

- [ ] **Step 2: Live check with the real CLIs**

1. Start Hub: `npm run dev` (port 5173).
2. Open `http://localhost:5173/`, click the poster, and confirm `/room` shows "Room offline". Click **Start room** and wait until all three CRTs show `idle` (Antigravity can take about a minute).
3. Start a session: project `hello-room`, task "Make a Node CLI hello.js that prints Hello from the Agent Room, plus a README", with the default discussion.
4. Watch the discussion. Approve roles, approve the plan, wait for the build to finish, read `D:\ascend-builds\hello-room\SUMMARY.md`, and click Accept.
5. Run `git -C D:\ascend-builds\hello-room log --oneline` and `node D:\ascend-builds\hello-room\hello.js`.
6. Start a second session (`stop-check`) and press **Stop** during a Build turn. Confirm the stage becomes `stopped` and `git -C D:\ascend-builds\stop-check status --short` is empty.

Record: turn counts, the slowest turn, any pause reasons, and whether the `agy` multi-line prompt arrived intact (its first discussion reply should reference the owner task).

- [ ] **Step 3: Update the handoff**

In `ASCEND_HANDOFF.md`, under **Ascend Hub**, add after the "Key paths" sentence:

```markdown
The Agent Room (`/room`, opened from the shelf poster) runs Codex, Claude and Antigravity headless as a team. Its room process is `scripts/agent-room/server.mjs` (127.0.0.1:5181, token in ignored `.sites-runtime/agent-room/server.json`); projects are built under `D:\ascend-builds\`. Spec: `docs/superpowers/specs/2026-10-13-agent-room-design.md`.
```

Replace **Current session** using the template in that file: the objective (Agent Room), branch `claude/agent-room` and its HEAD, changed files, the check results from Step 1, the live check results from Step 2, outstanding issues, and the commit/push status.

- [ ] **Step 4: Commit**

```bash
git add ASCEND_HANDOFF.md
git commit -m "docs: record the agent room in the Ascend handoff"
```

Do not push. Ask the owner first.
