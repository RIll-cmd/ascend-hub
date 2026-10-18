import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { buildInvocation, runTurn as realRunTurn } from './agents.mjs';
import { skillReads, subagentEvent, usageEvent } from './events.mjs';
import { AGENT_IDS, extractJsonBlock, isReady, validateJudge, validatePlan, validateReassign, validateRoles, validateVerdict } from './parse.mjs';
import { PROJECT_NAME, resolveDebateFolder, resolveProjectDir, resolveRepo, roomError } from './paths.mjs';
import { branchDiff, commitAll, commitDiff, createProject, createWorktree, deleteBranch, excludeFromGit, fastForward, finishWorktree, headCommit, lastCommitDiff, linkDependencies, openPullRequest, renderPlan, resetTo, rollback, rootCommit, runCheck, squashMerge } from './project.mjs';
import { AGENT_NAMES, buildPrompt } from './prompts.mjs';
import { attention, GATES } from './attention.mjs';
import { cleanLimits, DEFAULT_LIMITS, sessionLimitHit } from './limits.mjs';
import { addNotes, memoryKey, readMemory, splitProposal } from './memory.mjs';
import { claudeQuota, latestCodexQuota } from './quota.mjs';
import { activeRoleSets, installSkills } from './skills.mjs';
import { capturePreview, findBrowser, validatePreview } from './preview.mjs';
import { appendJsonLine, readJson, readJsonLines, writeJsonAtomic } from './store.mjs';

export const TERMINAL = new Set(['done', 'rejected', 'stopped']);

// Only Claude has a working sub-agent switch; it defaults to on.
const others = agent => AGENT_IDS.filter(id => id !== agent);

function subagentChoice(choice) {
  if (choice === undefined || choice === null) return { claude: true };
  if (typeof choice !== 'object' || typeof (choice.claude ?? true) !== 'boolean') throw roomError('SUBAGENTS_INVALID');
  return { claude: choice.claude ?? true };
}
export { GATES };

const TEMPLATES = ['feature', 'bugfix', 'refactor'];

// Optional model per agent ("sonnet", "gpt-6-mini"); names only, never flags or paths.
function cleanModels(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw roomError('MODELS_INVALID');
  const models = {};
  for (const [agent, model] of Object.entries(value)) {
    if (model === '' || model === null) continue;
    if (!['codex', 'claude'].includes(agent) || typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/.test(model)) throw roomError('MODELS_INVALID', `${agent}: ${model}`);
    models[agent] = model;
  }
  return models;
}

// Roles without the agent's suggested options; "wear" only when someone wears a set.
const teamOf = ({ orchestrator, coders, reviewer, wear }) => ({ orchestrator, coders, reviewer, ...(wear ? { wear } : {}) });

export class RoomSession {
  constructor({ dir, settings, runTurn = realRunTurn, state, transcript }) {
    this.dir = dir;
    this.settings = settings;
    this.runTurn = runTurn;
    this.state = state;
    this.transcript = transcript;
    // One per running turn or check; a race runs several at once.
    this.controllers = new Set();
    this.turnUsage = {};
    this.turnReads = {};
    this.loop = null;
    this.lastSave = 0;
    this.startLabels = new Map();
  }

  static create({ dataDir, settings, runTurn }, body = {}) {
    if (body.mode === 'debate') return RoomSession.createDebate({ dataDir, settings, runTurn }, body);
    const { project, task, roles, repo, check } = body;
    const template = body.template ?? 'feature';
    if (!TEMPLATES.includes(template)) throw roomError('TEMPLATE_INVALID');
    if (template !== 'feature' && !(typeof check === 'string' && check.trim())) throw roomError('CHECK_REQUIRED', 'Bug fix and refactor sessions need a check command.');
    const models = cleanModels(body.models);
    const limits = cleanLimits(body.limits, settings.limits ?? DEFAULT_LIMITS);
    if (check !== undefined && check !== null && (typeof check !== 'string' || check.length > 500)) throw roomError('CHECK_INVALID');
    if (body.parallel !== undefined && body.parallel !== null && typeof body.parallel !== 'boolean') throw roomError('PARALLEL_INVALID');
    if (body.raceGate !== undefined && body.raceGate !== null && typeof body.raceGate !== 'boolean') throw roomError('RACE_GATE_INVALID');
    const subagents = subagentChoice(body.subagents);
    if (typeof task !== 'string' || !task.trim() || task.length > 4000) throw roomError('TASK_INVALID');
    const preview = validatePreview(body.preview);
    // The sets on now are the session's for good; switching one later never changes a running session.
    const roleSets = activeRoleSets(dataDir, body.roleSets ?? null);
    let presetRoles = null;
    if (roles !== undefined && roles !== null) {
      const checked = validateRoles(roles, roleSets.map(r => r.id));
      if (!checked.ok) throw roomError('ROLES_INVALID', checked.error);
      presetRoles = teamOf(checked.value);
    }
    const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    let projectDir;
    let repoInfo = null;
    if (repo !== undefined && repo !== null && repo !== '') {
      if (typeof project !== 'string' || !PROJECT_NAME.test(project)) throw roomError('PROJECT_NAME_INVALID');
      const repoDir = resolveRepo(repo, settings);
      const branch = `room/${project}-${id.slice(-6)}`;
      projectDir = join(settings.buildsRoot, 'worktrees', `${basename(repoDir)}-${id}`);
      const { base, baseBranch } = createWorktree(repoDir, projectDir, branch);
      linkDependencies(repoDir, projectDir);
      repoInfo = { dir: repoDir, branch, base, baseBranch };
    } else {
      projectDir = resolveProjectDir(settings.buildsRoot, project);
      mkdirSync(settings.buildsRoot, { recursive: true });
      createProject(projectDir);
    }
    installSkills(dataDir, roleSets, projectDir);
    const state = {
      id, mode: 'build', subagents, project, projectDir, task: task.trim(), stage: presetRoles ? 'plan' : 'discuss', roles: presetRoles,
      plan: null, discussTurns: 0, pause: null, active: null, createdAt: new Date().toISOString(),
      repo: repoInfo, check: check?.trim() || null, limits, turns: 0, workMs: 0, usage: {}, template, models,
      // A bug fix is a strict red-then-green sequence, so it never runs tasks in parallel.
      parallel: body.parallel === true && template !== 'bugfix', roleSets, preview,
      // The owner picks among race attempts that pass, instead of the judge's pick merging at once.
      raceGate: body.raceGate === true,
    };
    const session = new RoomSession({ dir: join(dataDir, 'sessions', id), settings, runTurn, state, transcript: [] });
    session.save();
    session.say('room', repoInfo
      ? `Session started on branch ${repoInfo.branch} of ${repoInfo.dir} (worktree ${projectDir}).`
      : `Session started for project "${project}" in ${projectDir}.`);
    return session;
  }

  // A debate only reads projectDir (an allowlisted repo); it never creates, commits or rolls back anything there.
  static createDebate({ dataDir, settings, runTurn }, { question, folder, judge = 'codex', subagents: choice }) {
    const subagents = subagentChoice(choice);
    if (typeof question !== 'string' || !question.trim() || question.length > 4000) throw roomError('QUESTION_INVALID');
    if (!AGENT_IDS.includes(judge)) throw roomError('JUDGE_INVALID');
    const projectDir = resolveDebateFolder(folder, settings);
    const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const state = {
      id, mode: 'debate', subagents, project: basename(projectDir), projectDir, task: question.trim(), stage: 'opening', roles: null, judge,
      plan: null, debateTurns: 0, answer: null, pause: null, active: null, createdAt: new Date().toISOString(),
    };
    const session = new RoomSession({ dir: join(dataDir, 'sessions', id), settings, runTurn, state, transcript: [] });
    session.save();
    session.say('room', `Debate started in ${projectDir}. Judge: ${AGENT_NAMES[judge]}.`);
    return session;
  }

  static load({ settings, runTurn }, dir) {
    const state = readJson(join(dir, 'state.json'));
    state.active = null;
    const session = new RoomSession({ dir, settings, runTurn, state, transcript: readJsonLines(join(dir, 'transcript.jsonl')) });
    session.save();
    return session;
  }

  save() {
    // Every stage change is saved, so this is where its start time is recorded for the workflow view.
    const log = (this.state.stageLog ??= []);
    if (log.at(-1)?.stage !== this.state.stage) log.push({ stage: this.state.stage, at: new Date().toISOString() });
    writeJsonAtomic(join(this.dir, 'state.json'), this.state);
  }

  diff(commit) {
    // An attempt waiting at the race gate: its whole branch against where the race started.
    const attempt = /^attempt:(codex|claude|agy)$/.exec(String(commit));
    if (attempt) {
      const pending = this.state.stage === 'gate-race' ? this.racedTask()?.raced?.pending : null;
      const tried = pending?.attempts.find(a => a.agent === attempt[1]);
      if (!tried) throw roomError('DIFF_INVALID');
      return { commit, text: branchDiff(this.state.projectDir, pending.base, 150_000, tried.branch) };
    }
    if (commit === 'all') {
      const base = this.state.repo?.base ?? rootCommit(this.state.projectDir);
      return { commit, text: branchDiff(this.state.projectDir, base) };
    }
    const own = this.state.plan?.tasks.some(t => t.commit && t.commit === commit);
    if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit) || !own) throw roomError('DIFF_INVALID');
    return { commit, text: commitDiff(this.state.projectDir, commit) };
  }

  // Every message gets a seq (for "what is new"); routing fields tell the deck where to draw it.
  say(from, text, { to, kind, by, sub, usage } = {}) {
    const last = this.transcript.at(-1)?.seq ?? this.transcript.length;
    const message = { at: new Date().toISOString(), seq: last + 1, from, text };
    if (to !== undefined) message.to = to;
    if (kind) message.kind = kind;
    if (by) message.by = by;
    if (sub) message.sub = sub;
    if (usage) message.usage = usage;
    this.transcript.push(message);
    appendJsonLine(join(this.dir, 'transcript.jsonl'), message);
  }

  summary() {
    const { id, mode, project, stage, pause, active, roles } = this.state;
    return { id, mode, project, stage, pause, active, roles };
  }

  view() { return { ...this.state, attention: attention(this.state, this.transcript), transcript: this.transcript.slice(-200) }; }

  // Sub-agent progress only updates the CRT (saved at most once a second); start and finish also go to the transcript.
  onAgentEvent(agent, event) {
    const used = usageEvent(agent, event);
    if (used) this.turnUsage[agent] = used;
    for (const id of skillReads(agent, event)) this.turnReads[agent]?.add(id);
    const quota = agent === 'claude' ? claudeQuota(event) : null;
    if (quota) this.onQuota?.('claude', quota);
    // Codex writes its windows to its own session log; refresh after each Codex turn.
    if (agent === 'codex' && event.type === 'turn.completed' && this.settings.codexHome) {
      const latest = latestCodexQuota(this.settings.codexHome);
      if (latest) this.onQuota?.('codex', latest);
    }
    const active = this.state.active;
    const sub = subagentEvent(agent, event);
    if (!sub || active?.agent !== agent) return;
    const list = active.subagents ?? (active.subagents = []);
    const item = list.find(s => s.id === sub.id);
    if (sub.kind === 'started') {
      list.push({ id: sub.id, label: sub.label, tool: null, status: 'running' });
      this.startLabels.set(sub.id, sub.label);
      this.say('room', `${AGENT_NAMES[agent]} started a sub-agent: ${sub.label}.`, { kind: 'subagent', by: agent, sub: sub.id, to: [] });
      this.saveNow();
    } else if (sub.kind === 'progress' && item) {
      item.label = sub.label;
      item.tool = sub.tool ?? item.tool;
      this.saveSoon();
    } else if (sub.kind === 'finished' && item) {
      item.status = sub.status;
      this.say('room', `${AGENT_NAMES[agent]}'s sub-agent finished (${sub.status}): ${this.startLabels.get(sub.id) ?? item.label}.`,
        { kind: 'subagent', by: agent, sub: sub.id, to: [] });
      this.saveNow();
    } else if (sub.kind === 'waiting' || sub.kind === 'waited') {
      active.waiting = sub.kind === 'waiting';
      this.saveNow();
    }
  }

  saveNow() {
    this.lastSave = Date.now();
    this.save();
  }

  saveSoon() {
    if (Date.now() - this.lastSave >= 1000) this.saveNow();
  }

  setActive(agent, activity) {
    this.state.active = agent ? { agent, activity, since: new Date().toISOString() } : null;
    this.save();
  }

  // Turns, work time and tokens per agent; the budget limits read these.
  countTurn(agent, durationMs = 0) {
    const state = this.state;
    state.turns = (state.turns ?? 0) + 1;
    state.workMs = (state.workMs ?? 0) + durationMs;
    const total = ((state.usage ??= {})[agent] ??= { turns: 0, tokens: 0, costUsd: 0 });
    total.turns += 1;
    total.tokens += this.turnUsage[agent]?.tokens ?? 0;
    total.costUsd += this.turnUsage[agent]?.costUsd ?? 0;
  }

  pauseWith(reason, extra = {}) {
    this.state.pause = { reason, at: new Date().toISOString(), ...extra };
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
      case 'opening':
      case 'critique': return this.debateStep();
      case 'verdict': return this.verdictStep();
      default: throw roomError('STAGE_INVALID', this.state.stage);
    }
  }

  prompt(stage, agent, extra = {}) {
    return buildPrompt({
      stage, agent, roles: this.state.roles, task: this.state.task,
      planText: this.state.plan ? renderPlan(this.state.plan.tasks) : '', transcript: this.transcript, extra: { template: this.state.template, parallel: this.state.parallel, ...extra },
      memory: this.projectMemory(), roleSets: this.state.roleSets ?? [],
    });
  }

  get setIds() { return (this.state.roleSets ?? []).map(s => s.id); }

  // Sessions live in <dataDir>/sessions/<id>; project memory sits beside them.
  get dataDir() { return dirname(dirname(this.dir)); }

  projectMemory() {
    try { return this.state.mode === 'debate' ? [] : readMemory(this.dataDir, memoryKey(this.state)); } catch { return []; }
  }

  // A side turn (race or parallel task) runs in its own worktree (cwd), leaves the deck's active agent alone and reports failure instead of pausing.
  // task: the plan task this turn works on, so the skills the agent opens are recorded on it.
  async turn(agent, mode, prompt, activity, to = [], { cwd = this.state.projectDir, side = false, task = null } = {}) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (this.state.stage === 'stopped') return null;
      const hit = sessionLimitHit(this.state);
      if (hit) {
        this.pauseWith(hit.reason, { kind: hit.kind });
        return null;
      }
      if (!side) this.setActive(agent, activity);
      this.turnUsage[agent] = null;
      this.turnReads[agent] = new Set();
      const controller = new AbortController();
      this.controllers.add(controller);
      const chosen = this.state.models?.[agent];
      const settings = chosen ? { ...this.settings, agents: { ...this.settings.agents, [agent]: { ...this.settings.agents[agent], model: chosen } } } : this.settings;
      const invocation = buildInvocation(agent, mode, prompt, {
        cwd, settings, outFile: join(this.dir, 'codex-last.txt'), subagents: this.state.subagents?.claude !== false,
      });
      const { timeouts } = this.settings;
      const timeoutMs = mode === 'edit' ? timeouts.build : this.state.mode === 'debate' ? timeouts.debate : timeouts.chat;
      const onEvent = event => this.onAgentEvent(agent, event);
      const result = await this.runTurn(invocation, { cwd, timeoutMs, signal: controller.signal, onEvent });
      this.controllers.delete(controller);
      if (task) this.noteReads(task, agent);
      if (this.state.stage === 'stopped' || result.aborted) return null;
      if (!side) this.setActive(null);
      this.countTurn(agent, result.durationMs);
      if (result.ok) {
        this.say(agent, result.text, { to: typeof to === 'function' ? to(result.text) : to, usage: this.turnUsage[agent] });
        return result.text;
      }
      const why = result.timedOut ? 'timed out' : result.error ?? (result.code === 0 ? 'returned no text' : `exited with code ${result.code}`);
      const detail = result.stderr ? ` ${result.stderr.slice(-300)}` : '';
      this.say('room', `${AGENT_NAMES[agent]} turn failed (${why}).${detail}${attempt === 1 ? ' Retrying once.' : ''}`);
    }
    if (side) return null;
    this.pauseWith(`${AGENT_NAMES[agent]} failed twice.`);
    return null;
  }

  parseWith(text, validate) {
    const block = extractJsonBlock(text);
    return block.ok ? validate(block.value) : block;
  }

  noteReads(task, agent) {
    const read = [...(this.turnReads[agent] ?? [])];
    if (!read.length) return;
    task.skillsRead ??= {};
    task.skillsRead[agent] = [...new Set([...(task.skillsRead[agent] ?? []), ...read])];
  }

  async jsonTurn(agent, prompt, activity, validate, to = [], options = {}) {
    let text = await this.turn(agent, 'read', prompt, activity, to, options);
    if (text === null) return null;
    let parsed = this.parseWith(text, validate);
    if (parsed.ok) return parsed.value;
    this.say('room', `Invalid answer: ${parsed.error} Asking once more.`);
    text = await this.turn(agent, 'read', `${prompt}\n\nYour previous answer was rejected: ${parsed.error}\nReply again with only the corrected json block.`, activity, to, options);
    if (text === null) return null;
    parsed = this.parseWith(text, validate);
    if (parsed.ok) return parsed.value;
    this.pauseWith(`${AGENT_NAMES[agent]} returned invalid JSON twice: ${parsed.error}`);
    return null;
  }

  async discussStep() {
    const state = this.state;
    const agent = AGENT_IDS[state.discussTurns % AGENT_IDS.length];
    const text = await this.turn(agent, 'read', this.prompt('discuss', agent), 'thinking', others(agent));
    if (text === null) return;
    state.discussTurns += 1;
    const latest = AGENT_IDS.map(id => this.transcript.findLast(m => m.from === id));
    if (state.discussTurns >= this.settings.maxDiscussTurns || latest.every(m => m && isReady(m.text))) state.stage = 'roles';
    this.save();
  }

  async rolesStep() {
    const roles = await this.jsonTurn('codex', this.prompt('roles', 'codex'), 'proposing roles', v => validateRoles(v, this.setIds), []);
    if (!roles) return;
    const { options, ...chosen } = roles;
    this.state.roles = chosen;
    this.state.roleOptions = options;
    this.state.stage = 'gate-roles';
    this.save();
    this.say('room', 'Roles proposed. Waiting for the owner.');
  }

  async planStep() {
    const { roles } = this.state;
    const plan = await this.jsonTurn(roles.orchestrator, this.prompt('plan', roles.orchestrator), 'planning', v => validatePlan(v, roles.coders, this.setIds), []);
    if (!plan) return;
    this.setPlan(plan.tasks, 'plan: initial plan', plan.options);
    this.state.stage = 'gate-plan';
    this.save();
    this.say('room', 'Plan ready. Waiting for the owner.');
  }

  setPlan(tasks, message, options = []) {
    this.state.plan = { tasks: tasks.map(t => ({ ...t, status: 'pending', attempts: 0, reassigned: false, commit: null, notes: '' })), options };
    // A repo session's branch carries only the owner's code; the room's own notes stay with the session.
    if (this.state.repo) return writeFileSync(join(this.dir, 'PLAN.md'), renderPlan(this.state.plan.tasks), 'utf8');
    writeFileSync(join(this.state.projectDir, 'PLAN.md'), renderPlan(this.state.plan.tasks), 'utf8');
    const hash = commitAll(this.state.projectDir, message);
    if (hash) this.say('room', `Committed ${hash} "${message}".`);
  }

  async buildStep() {
    const state = this.state;
    const task = state.plan.tasks.find(t => t.status !== 'done' && t.status !== 'skipped');
    if (!task) {
      state.stage = 'finish';
      this.save();
      return;
    }
    // A refactor must start from green checks, or "behaviour unchanged" cannot be told apart from already broken.
    if (state.template === 'refactor' && !state.baseline?.ok) {
      const baseline = await this.runChecks();
      if (baseline === null) return;
      state.baseline = baseline;
      if (!baseline.ok) {
        this.pauseWith(`Checks already fail before any change (exit ${baseline.code ?? 'none'}). Fix them, then retry, or start a Feature session.`, { kind: 'baseline' });
        return;
      }
      this.say('room', 'Checks pass before any change; the refactor must keep them green.');
    }
    if (state.parallel) {
      const batch = this.readyBatch();
      if (batch.length > 1) return this.parallelTasks(batch);
    }
    if (task.status !== 'review') {
      const allowed = (state.limits?.rounds ?? Infinity) + (task.extraRounds ?? 0);
      if ((task.rounds ?? 0) >= allowed) {
        this.pauseWith(`Task ${task.id} reached ${task.rounds} rounds. Retry allows one more.`, { kind: 'rounds', task: task.id });
        return;
      }
      task.rounds = (task.rounds ?? 0) + 1;
      rollback(state.projectDir);
      task.status = 'running';
      this.save();
      const before = headCommit(state.projectDir);
      // Bug fix task 1 must go red, which no race can rank, so it never races.
      if (task.race && state.roles.coders.length > 1 && !(state.template === 'bugfix' && task.id === 1)) return this.raceTask(task, before);
      this.say('room', `Task ${task.id}: ${task.title} → ${AGENT_NAMES[task.assignee]}`, { kind: 'assign', by: state.roles.orchestrator, to: [task.assignee] });
      const text = await this.turn(task.assignee, 'edit', this.prompt('build', task.assignee, { task }), 'editing',
        state.roles.reviewer ? [state.roles.reviewer] : [state.roles.orchestrator], { task });
      if (text === null) return;
      const message = `task-${task.id}: ${task.title}`;
      // Codex and agy can run git commit themselves; their commits count as the task's changes.
      const hash = commitAll(state.projectDir, message) ?? (headCommit(state.projectDir) !== before ? headCommit(state.projectDir) : null);
      if (!hash) return this.taskFailed(task, 'no changes were made');
      task.commit = hash;
      this.say('room', `Committed ${hash} "${message}".`);
      if (state.check) {
        const result = await this.runChecks();
        if (result === null) return;
        task.check = result;
        const last = result.output.split('\n').filter(Boolean).at(-1) ?? '';
        // A bug fix starts with a test that reproduces the bug, so task 1 must leave the checks red.
        if (state.template === 'bugfix' && task.id === 1) {
          if (result.ok) {
            resetTo(state.projectDir, before);
            task.commit = null;
            return this.taskFailed(task, 'the checks already pass, so the new test does not reproduce the bug. Add a test that fails until the bug is fixed, and do not fix it yet.');
          }
          this.say('room', `Checks fail as expected (exit ${result.code ?? 'none'}): the new test reproduces the bug.`);
        } else {
          this.say('room', result.ok ? `Checks passed (${Math.round(result.ms / 1000)}s).` : `Checks failed (exit ${result.code ?? 'none'}): ${last.slice(0, 300)}`);
          if (!result.ok) return this.taskFailed(task, `the checks failed (${state.check}):\n${result.output.slice(-3000)}`);
        }
      }
      if (!this.reviewPasses(task).length) {
        task.status = 'done';
        this.save();
        return;
      }
      task.status = 'review';
      this.save();
    }
    const review = await this.runReviews(task);
    if (!review) return;
    if (review.ok) {
      task.status = 'done';
      this.save();
      return;
    }
    return this.taskFailed(task, review.notes);
  }

  // A task's review passes, in order: the code review (with a reviewer), then security and design when their sets are on.
  // A pass goes to an agent wearing its set other than the coder, else the reviewer, else the orchestrator.
  reviewPasses(task) {
    const { roles } = this.state;
    const on = new Set(this.setIds);
    const pick = set => AGENT_IDS.find(id => id !== task.assignee && roles.wear?.[id]?.includes(set)) ?? roles.reviewer ?? roles.orchestrator;
    const passes = [];
    if (roles.reviewer) passes.push({ kind: 'code', agent: roles.reviewer, set: on.has('code-reviewer') ? 'code-reviewer' : null });
    if (on.has('security')) passes.push({ kind: 'security', agent: pick('security'), set: 'security' });
    if (on.has('ui-ux') && ['frontend', 'ui-ux'].includes(task.role)) passes.push({ kind: 'design', agent: pick('ui-ux'), set: 'ui-ux' });
    return passes;
  }

  // A screenshot of the running app for a design review, inside the project so every CLI may open it; null without a preview.
  // A failed capture never fails the task: the reviewer is told and judges from the diff.
  async previewFor(task) {
    const { preview, projectDir } = this.state;
    if (!preview) return null;
    const file = `.ascend/preview/task-${task.id}.png`;
    excludeFromGit(projectDir, '.ascend/');
    const controller = new AbortController();
    this.controllers.add(controller);
    this.say('room', `Starting the app for a preview: ${preview.command}`);
    const result = await capturePreview({ dir: projectDir, ...preview, outFile: join(projectDir, file), browser: findBrowser(this.settings),
      timeoutMs: this.settings.previewTimeoutMs ?? 60_000, signal: controller.signal });
    this.controllers.delete(controller);
    this.say('room', result.ok ? `Captured the app preview for task ${task.id}.` : `The app preview failed: ${result.error}`);
    return result.ok ? { file } : { error: result.error };
  }

  // Runs the passes this attempt has not passed yet (a resumed session skips the rest): { ok }, { notes } or null when stopped.
  async runReviews(task) {
    task.passed ??= [];
    for (const pass of this.reviewPasses(task)) {
      if (task.passed.includes(pass.kind)) continue;
      const screenshot = pass.kind === 'design' ? await this.previewFor(task) : null;
      if (this.state.stage === 'stopped') return null;
      const prompt = this.prompt('review', pass.agent, { task, pass, screenshot, diff: lastCommitDiff(this.state.projectDir), check: this.state.check });
      const verdict = await this.jsonTurn(pass.agent, prompt, pass.kind === 'code' ? 'reviewing' : `${pass.kind} review`, validateVerdict, [task.assignee], { task });
      if (!verdict) return null;
      if (verdict.verdict !== 'ok') {
        return { notes: pass.kind === 'code' ? verdict.notes || 'the reviewer requested changes' : `${pass.kind} review: ${verdict.notes || 'changes requested'}` };
      }
      task.passed.push(pass.kind);
      this.save();
    }
    return { ok: true };
  }

  // The owner's check command, stoppable like an agent turn; null means the session stopped meanwhile.
  async runChecks(dir = this.state.projectDir) {
    const controller = new AbortController();
    this.controllers.add(controller);
    if (dir === this.state.projectDir) this.say('room', `Running checks: ${this.state.check}`);
    const result = await runCheck(dir, this.state.check, { timeoutMs: this.settings.timeouts?.check ?? 900_000, signal: controller.signal });
    this.controllers.delete(controller);
    return this.state.stage === 'stopped' ? null : result;
  }

  // Runs work(item) for every item at once, each in its own worktree branched from the session's HEAD, then done();
  // every worktree and branch is removed afterwards, whatever happened.
  async inWorktrees(items, work, done) {
    const state = this.state;
    // A leftover from a crashed run would block the new worktree.
    for (const item of items) {
      try { finishWorktree(state.projectDir, item.dir, item.branch, null, 'reject'); } catch { /* nothing left over */ }
    }
    try {
      // allSettled: one item's setup error must not clean up worktrees another agent is still editing.
      const settled = await Promise.allSettled(items.map(async item => {
        createWorktree(state.projectDir, item.dir, item.branch);
        item.made = true;
        linkDependencies(state.repo?.dir ?? state.projectDir, item.dir);
        installSkills(this.dataDir, state.roleSets ?? [], item.dir);
        await work(item);
      }));
      const broken = settled.find(r => r.status === 'rejected');
      if (broken) throw broken.reason;
      return await done();
    } finally {
      // keep: an attempt waiting at the race gate keeps its branch; its worktree still goes.
      for (const item of items) if (item.made) finishWorktree(state.projectDir, item.dir, item.branch, null, item.keep ? 'keep' : 'reject');
    }
  }

  // The commit an agent left in a side worktree: the room commits for it, or it committed itself.
  sideCommit(dir, base, message) {
    return commitAll(dir, message) ?? (headCommit(dir) !== base ? headCommit(dir) : null);
  }

  // Best-of-N: every coder attempts the task at once in its own worktree, branched from the session's HEAD.
  // Attempts that change nothing or fail the checks drop out; one judge turn ranks the rest; the winner fast-forwards in.
  async raceTask(task, base) {
    const state = this.state;
    const coders = state.roles.coders;
    const message = `task-${task.id}: ${task.title}`;
    const to = state.roles.reviewer ? [state.roles.reviewer] : [state.roles.orchestrator];
    // Every prompt is built before any attempt replies, so no racer sees another's work.
    const prompts = Object.fromEntries(coders.map(agent => [agent, this.prompt('build', agent, { task })]));
    const attempts = coders.map(agent => ({
      agent, branch: `room/try-${state.id.slice(-6)}-t${task.id}-${agent}`,
      dir: join(this.settings.buildsRoot, 'worktrees', `${basename(state.projectDir)}-t${task.id}-${agent}`),
    }));
    this.say('room', `Task ${task.id}: ${task.title} → raced by ${coders.map(a => AGENT_NAMES[a]).join(', ')}, each in its own worktree.`,
      { kind: 'assign', by: state.roles.orchestrator, to: [...coders] });
    this.setActive(coders[0], `racing ${coders.length} attempts`);
    try {
      await this.inWorktrees(attempts, async attempt => {
        const text = await this.turn(attempt.agent, 'edit', prompts[attempt.agent], 'racing', to, { cwd: attempt.dir, side: true, task });
        if (text === null) return Object.assign(attempt, { ok: false, why: 'the turn failed' });
        attempt.summary = text;
        attempt.commit = this.sideCommit(attempt.dir, base, message);
        if (!attempt.commit) return Object.assign(attempt, { ok: false, why: 'no changes were made' });
        if (state.check) {
          attempt.check = await this.runChecks(attempt.dir);
          if (!attempt.check?.ok) return Object.assign(attempt, { ok: false, why: `the checks failed (exit ${attempt.check?.code ?? 'none'})` });
        }
        attempt.diff = branchDiff(attempt.dir, base, 20_000);
        attempt.ok = true;
      }, () => this.pickWinner(task, attempts, base));
    } finally {
      if (state.active?.activity?.startsWith('racing')) this.setActive(null);
      if (task.status === 'running') {
        task.status = 'pending';
        this.save();
      }
    }
  }

  async pickWinner(task, attempts, base) {
    const state = this.state;
    this.setActive(null);
    if (state.stage === 'stopped' || state.pause) return;
    for (const a of attempts) this.say('room', `${AGENT_NAMES[a.agent]}'s attempt ${a.ok ? (state.check ? 'passed the checks' : 'is ready') : `dropped out: ${a.why}`}.`);
    const survivors = attempts.filter(a => a.ok);
    task.raced = { attempts: attempts.map(a => ({ agent: a.agent, ok: Boolean(a.ok), commit: a.commit ?? null, why: a.why ?? '' })), winner: null, reason: '' };
    if (survivors.length === 0) {
      const why = attempts.map(a => `${AGENT_NAMES[a.agent]}: ${a.why}`).join('; ');
      const failedCheck = attempts.find(a => a.check)?.check;
      return this.taskFailed(task, `no attempt passed (${why}).${failedCheck ? `\n${failedCheck.output.slice(-2000)}` : ''}`);
    }
    let winner = survivors[0];
    if (survivors.length > 1) {
      const judge = state.roles.reviewer ?? state.roles.orchestrator;
      const pick = await this.jsonTurn(judge, this.prompt('judge', judge, { task, attempts: survivors }), 'judging',
        v => validateJudge(v, survivors.map(a => a.agent)), survivors.map(a => a.agent));
      if (!pick) return;
      winner = survivors.find(a => a.agent === pick.winner);
      task.raced.reason = pick.reason;
      if (state.raceGate) return this.awaitRacePick(task, survivors, winner, base);
    }
    this.keepWinner(task, winner);
    this.say('room', `Kept ${AGENT_NAMES[winner.agent]}'s attempt (${task.commit})${task.raced.reason ? `: ${task.raced.reason.replace(/\.$/, '')}` : ''}. The other attempts were deleted.`);
    this.save();
    if (task.status === 'done') return;
    const review = await this.runReviews(task);
    if (!review) return;
    if (!review.ok) return this.taskFailed(task, review.notes);
    task.status = 'done';
    this.save();
  }

  // The kept attempt goes through the same review passes as any task; a resumed session continues them from buildStep.
  keepWinner(task, winner) {
    task.raced.winner = winner.agent;
    task.assignee = winner.agent;
    task.commit = fastForward(this.state.projectDir, winner.branch);
    if (winner.check) task.check = winner.check;
    task.status = this.reviewPasses(task).length ? 'review' : 'done';
  }

  // The race gate: the passing attempts' branches stay (their worktrees go) until the owner keeps one.
  awaitRacePick(task, survivors, pick, base) {
    const state = this.state;
    for (const a of survivors) a.keep = true;
    task.raced.pick = pick.agent;
    task.raced.pending = { base, attempts: survivors.map(a => ({ agent: a.agent, branch: a.branch, commit: a.commit, check: a.check ?? null })) };
    state.raceTask = task.id;
    state.stage = 'gate-race';
    this.save();
    this.say('room', `The judge picked ${AGENT_NAMES[pick.agent]}'s attempt for task ${task.id}. Waiting for the owner to keep it or pick another.`);
  }

  racedTask() { return this.state.plan?.tasks.find(t => t.id === this.state.raceTask) ?? null; }

  dropRaceBranches(task) {
    for (const a of task.raced?.pending?.attempts ?? []) {
      try { deleteBranch(this.state.projectDir, a.branch); } catch { /* already gone */ }
    }
    delete task.raced.pending;
    delete this.state.raceTask;
  }

  // Pending tasks whose earlier tasks are finished, at most one per coder; a race always runs on its own.
  readyBatch() {
    const { plan, limits } = this.state;
    const finished = id => ['done', 'skipped'].includes(plan.tasks.find(t => t.id === id)?.status);
    const busy = new Set();
    const batch = [];
    for (const t of plan.tasks) {
      const allowed = (limits?.rounds ?? Infinity) + (t.extraRounds ?? 0);
      if (t.status !== 'pending' || t.race || busy.has(t.assignee) || (t.rounds ?? 0) >= allowed || !(t.after ?? []).every(finished)) continue;
      busy.add(t.assignee);
      batch.push(t);
    }
    return batch;
  }

  // Independent tasks run at once, each in its own worktree; then the merge queue lands them one at a time, in plan order.
  async parallelTasks(batch) {
    const state = this.state;
    rollback(state.projectDir);
    const base = headCommit(state.projectDir);
    const to = state.roles.reviewer ? [state.roles.reviewer] : [state.roles.orchestrator];
    const items = batch.map(task => ({
      task, branch: `room/par-${state.id.slice(-6)}-t${task.id}`,
      dir: join(this.settings.buildsRoot, 'worktrees', `${basename(state.projectDir)}-t${task.id}`),
    }));
    for (const { task } of items) {
      task.rounds = (task.rounds ?? 0) + 1;
      task.status = 'running';
      this.say('room', `Task ${task.id}: ${task.title} → ${AGENT_NAMES[task.assignee]}`, { kind: 'assign', by: state.roles.orchestrator, to: [task.assignee] });
    }
    const prompts = Object.fromEntries(items.map(({ task }) => [task.id, this.prompt('build', task.assignee, { task })]));
    this.setActive(batch[0].assignee, `${batch.length} tasks in parallel`);
    try {
      await this.inWorktrees(items, async item => {
        const { task } = item;
        const text = await this.turn(task.assignee, 'edit', prompts[task.id], 'editing', to, { cwd: item.dir, side: true, task });
        if (text === null) return void (item.why = 'the turn failed');
        if (!this.sideCommit(item.dir, base, `task-${task.id}: ${task.title}`)) item.why = 'no changes were made';
      }, async () => {
        this.setActive(null);
        for (const item of items) {
          if (state.stage === 'stopped' || state.pause) return;
          if (item.why) await this.taskFailed(item.task, item.why);
          else await this.mergeTask(item);
        }
      });
    } finally {
      if (state.active?.activity?.endsWith('in parallel')) this.setActive(null);
      for (const { task } of items) if (task.status === 'running') task.status = 'pending';
      this.save();
    }
  }

  // One merge-queue step: squash the task in, run the checks and the review on the merged code; any failure undoes this merge only.
  async mergeTask({ task, branch }) {
    const state = this.state;
    const before = headCommit(state.projectDir);
    const message = `task-${task.id}: ${task.title}`;
    const undo = () => {
      resetTo(state.projectDir, before);
      task.commit = null;
      task.passed = [];
    };
    const merged = squashMerge(state.projectDir, branch, message);
    if (merged.conflict) return this.taskFailed(task, `its changes conflict with work merged before it (${merged.conflict.join(', ')}). Redo it on top of the current code.`);
    if (!merged.commit) return this.taskFailed(task, 'nothing was left to merge');
    task.commit = merged.commit;
    this.say('room', `Merged task ${task.id} as ${task.commit} "${message}".`);
    if (state.check) {
      const result = await this.runChecks();
      if (result === null) return;
      task.check = result;
      if (!result.ok) {
        undo();
        return this.taskFailed(task, `the checks failed after merging (${state.check}):\n${result.output.slice(-3000)}`);
      }
      this.say('room', `Checks passed after merging task ${task.id} (${Math.round(result.ms / 1000)}s).`);
    }
    const review = await this.runReviews(task);
    if (!review) return undo();
    if (!review.ok) {
      undo();
      return this.taskFailed(task, review.notes);
    }
    task.status = 'done';
    this.save();
  }

  async taskFailed(task, reason) {
    task.attempts += 1;
    task.passed = [];
    task.notes = reason;
    this.say('room', `Task ${task.id} attempt ${task.attempts} not accepted: ${reason}`);
    // The loop guard stops another round (a retry or a reassignment), never a skip: a task going in circles waits for the owner.
    const skipping = task.attempts >= 2 && task.reassigned;
    if (!skipping && (task.rounds ?? 0) >= (this.state.limits?.rounds ?? Infinity) + (task.extraRounds ?? 0)) {
      task.status = 'pending';
      this.pauseWith(`Task ${task.id} reached ${task.rounds} rounds. Retry allows one more.`, { kind: 'rounds', task: task.id });
      return;
    }
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
      v => validateReassign(v, roles.coders, task.assignee),
      text => {
        const block = extractJsonBlock(text);
        return block.ok && block.value?.action === 'reassign' && roles.coders.includes(block.value.to) ? [block.value.to] : [];
      });
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
    const text = await this.turn(orchestrator, 'read', this.prompt('finish', orchestrator), 'summarizing', []);
    if (text === null) return;
    const { summary, notes } = splitProposal(text);
    this.state.memoryProposal = notes;
    if (this.state.repo) {
      writeFileSync(join(this.dir, 'SUMMARY.md'), `${summary}\n`, 'utf8');
    } else {
      writeFileSync(join(this.state.projectDir, 'SUMMARY.md'), `${summary}\n`, 'utf8');
      const hash = commitAll(this.state.projectDir, 'docs: summary');
      if (hash) this.say('room', `Committed ${hash} "docs: summary".`);
    }
    this.state.stage = 'gate-result';
    this.save();
    this.say('room', 'Work finished. Waiting for the owner to accept or reject.');
  }

  async debateStep() {
    const state = this.state;
    const agent = AGENT_IDS[state.debateTurns % AGENT_IDS.length];
    // Openings must be independent, so they never see the conversation.
    const transcript = state.stage === 'opening' ? [] : this.transcript.filter(m => m.from !== 'room');
    const prompt = buildPrompt({ stage: state.stage, agent, roles: null, task: state.task, transcript });
    const text = await this.turn(agent, 'read', prompt, state.stage === 'opening' ? 'answering' : 'critiquing', state.stage === 'opening' ? [] : others(agent));
    if (text === null) return;
    state.debateTurns += 1;
    if (state.debateTurns === AGENT_IDS.length) state.stage = 'critique';
    if (state.debateTurns === AGENT_IDS.length * 2) state.stage = 'verdict';
    this.save();
  }

  async verdictStep() {
    const state = this.state;
    const transcript = this.transcript.filter(m => m.from !== 'room');
    const text = await this.turn(state.judge, 'read', buildPrompt({ stage: 'verdict', agent: state.judge, roles: null, task: state.task, transcript }), 'judging', [...AGENT_IDS]);
    if (text === null) return;
    writeFileSync(join(this.dir, 'answer.md'), `${text}\n`, 'utf8');
    state.answer = text;
    state.stage = 'done';
    this.save();
    this.say('room', 'Verdict saved.');
  }

  gate({ gate, decision, roles, plan, note, memory, agent } = {}) {
    const state = this.state;
    if (GATES[state.stage] !== gate || state.pause) throw roomError('GATE_NOT_OPEN');
    if (decision === 'revise' && (gate === 'roles' || gate === 'plan')) {
      if (typeof note !== 'string' || !note.trim() || note.length > 2000) throw roomError('NOTE_INVALID');
      // The agents read the conversation, so the note in the transcript is how they learn what to change.
      state.stage = gate;
      this.say('room', `Owner asked for changes to the ${gate}: ${note.replace(/\s+/g, ' ').trim()}`);
      this.save();
      return this.kick();
    }
    if (gate === 'roles') {
      if (decision !== 'approve') throw roomError('DECISION_INVALID');
      if (roles !== undefined) {
        const checked = validateRoles(roles, this.setIds);
        if (!checked.ok) throw roomError('ROLES_INVALID', checked.error);
        state.roles = teamOf(checked.value);
      }
      state.stage = 'plan';
      this.say('room', 'Owner approved the roles.');
    } else if (gate === 'plan') {
      if (decision !== 'approve') throw roomError('DECISION_INVALID');
      if (plan !== undefined) {
        const checked = validatePlan(plan, state.roles.coders, this.setIds);
        if (!checked.ok) throw roomError('PLAN_INVALID', checked.error);
        this.setPlan(checked.value.tasks, 'plan: owner edits');
      }
      state.stage = 'build';
      this.say('room', 'Owner approved the plan. Building.');
    } else if (gate === 'race') {
      const task = this.racedTask();
      const chosen = decision === 'approve' ? task?.raced?.pick : decision === 'pick' ? agent : null;
      const kept = task?.raced?.pending?.attempts.find(a => a.agent === chosen);
      if (!kept) throw roomError('DECISION_INVALID');
      this.keepWinner(task, kept);
      this.dropRaceBranches(task);
      state.stage = 'build';
      const over = chosen === task.raced.pick ? '' : ` over the judge's pick (${AGENT_NAMES[task.raced.pick]})`;
      this.say('room', `Owner kept ${AGENT_NAMES[chosen]}'s attempt for task ${task.id} (${task.commit})${over}. The other attempts were deleted.`);
    } else if (state.repo) {
      // "pr" pushes to a remote, so Hub offers it behind a confirmation and voice gates never do (see attention.mjs).
      if (!['merge', 'pr', 'accept', 'reject'].includes(decision)) throw roomError('DECISION_INVALID');
      const { dir, branch, baseBranch } = state.repo;
      if (decision === 'pr') {
        const summary = join(this.dir, 'SUMMARY.md');
        state.repo.prUrl = openPullRequest(dir, branch, baseBranch, {
          title: state.task.split('\n')[0].slice(0, 72), body: existsSync(summary) ? readFileSync(summary, 'utf8') : state.task, gh: this.settings.gh,
        });
      }
      // A refused merge or pull request throws before the stage changes, so the gate stays open.
      finishWorktree(dir, state.projectDir, branch, baseBranch, decision === 'merge' || decision === 'reject' ? decision : 'keep');
      state.stage = decision === 'reject' ? 'rejected' : 'done';
      this.keepNotes(decision, memory);
      this.say('room', decision === 'merge' ? `Owner merged ${branch} into ${baseBranch}.`
        : decision === 'pr' ? `Owner opened a pull request for ${branch}: ${state.repo.prUrl}`
        : decision === 'accept' ? `Owner kept branch ${branch}; merge it when ready.` : `Owner rejected the result; branch ${branch} was deleted.`);
    } else {
      if (decision !== 'accept' && decision !== 'reject') throw roomError('DECISION_INVALID');
      state.stage = decision === 'accept' ? 'done' : 'rejected';
      this.keepNotes(decision, memory);
      this.say('room', `Owner ${decision === 'accept' ? 'accepted' : 'rejected'} the result.`);
    }
    this.save();
    return this.kick();
  }

  // Only notes the owner approved at a kept result are stored; a rejected result teaches nothing.
  keepNotes(decision, memory) {
    if (decision === 'reject' || !Array.isArray(memory) || !memory.length) return;
    const kept = addNotes(this.dataDir, memoryKey(this.state), memory);
    this.say('room', `Saved ${memory.length} note${memory.length === 1 ? '' : 's'} to project memory (${kept.length} in total).`);
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
    } else if (state.pause.kind === 'turns') {
      state.limits.turns += 10;
    } else if (state.pause.kind === 'minutes') {
      state.limits.minutes += 15;
    } else if (state.pause.kind === 'rounds') {
      const task = state.plan?.tasks.find(t => t.id === state.pause.task);
      if (task) task.extraRounds = (task.extraRounds ?? 0) + 1;
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
    for (const controller of this.controllers) controller.abort();
    this.say('room', 'Owner stopped the session.');
    this.save();
    await this.loop;
    const raced = this.state.plan?.tasks.find(t => t.raced?.pending);
    if (raced) this.dropRaceBranches(raced);
    // A debate folder is the owner's own repo: never reset or clean it.
    if (this.state.mode === 'debate') return;
    // Committed work stays; anything half-written by the killed turn goes.
    rollback(this.state.projectDir);
  }
}
