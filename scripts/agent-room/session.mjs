import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildInvocation, runTurn as realRunTurn } from './agents.mjs';
import { subagentEvent } from './events.mjs';
import { AGENT_IDS, extractJsonBlock, isReady, validatePlan, validateReassign, validateRoles, validateVerdict } from './parse.mjs';
import { resolveDebateFolder, resolveProjectDir, roomError } from './paths.mjs';
import { commitAll, commitDiff, createProject, headCommit, lastCommitDiff, renderPlan, rollback } from './project.mjs';
import { AGENT_NAMES, buildPrompt } from './prompts.mjs';
import { attention, GATES } from './attention.mjs';
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

export class RoomSession {
  constructor({ dir, settings, runTurn = realRunTurn, state, transcript }) {
    this.dir = dir;
    this.settings = settings;
    this.runTurn = runTurn;
    this.state = state;
    this.transcript = transcript;
    this.controller = null;
    this.loop = null;
    this.lastSave = 0;
    this.startLabels = new Map();
  }

  static create({ dataDir, settings, runTurn }, body = {}) {
    if (body.mode === 'debate') return RoomSession.createDebate({ dataDir, settings, runTurn }, body);
    const { project, task, roles } = body;
    const subagents = subagentChoice(body.subagents);
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
      id, mode: 'build', subagents, project, projectDir, task: task.trim(), stage: presetRoles ? 'plan' : 'discuss', roles: presetRoles,
      plan: null, discussTurns: 0, pause: null, active: null, createdAt: new Date().toISOString(),
    };
    const session = new RoomSession({ dir: join(dataDir, 'sessions', id), settings, runTurn, state, transcript: [] });
    session.save();
    session.say('room', `Session started for project "${project}" in ${projectDir}.`);
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
    const own = this.state.plan?.tasks.some(t => t.commit && t.commit === commit);
    if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit) || !own) throw roomError('DIFF_INVALID');
    return { commit, text: commitDiff(this.state.projectDir, commit) };
  }

  // Every message gets a seq (for "what is new"); routing fields tell the deck where to draw it.
  say(from, text, { to, kind, by, sub } = {}) {
    const last = this.transcript.at(-1)?.seq ?? this.transcript.length;
    const message = { at: new Date().toISOString(), seq: last + 1, from, text };
    if (to !== undefined) message.to = to;
    if (kind) message.kind = kind;
    if (by) message.by = by;
    if (sub) message.sub = sub;
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
      case 'opening':
      case 'critique': return this.debateStep();
      case 'verdict': return this.verdictStep();
      default: throw roomError('STAGE_INVALID', this.state.stage);
    }
  }

  prompt(stage, agent, extra = {}) {
    return buildPrompt({
      stage, agent, roles: this.state.roles, task: this.state.task,
      planText: this.state.plan ? renderPlan(this.state.plan.tasks) : '', transcript: this.transcript, extra,
    });
  }

  async turn(agent, mode, prompt, activity, to = []) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (this.state.stage === 'stopped') return null;
      this.setActive(agent, activity);
      this.controller = new AbortController();
      const invocation = buildInvocation(agent, mode, prompt, {
        cwd: this.state.projectDir, settings: this.settings, outFile: join(this.dir, 'codex-last.txt'), subagents: this.state.subagents?.claude !== false,
      });
      const { timeouts } = this.settings;
      const timeoutMs = mode === 'edit' ? timeouts.build : this.state.mode === 'debate' ? timeouts.debate : timeouts.chat;
      const onEvent = event => this.onAgentEvent(agent, event);
      const result = await this.runTurn(invocation, { cwd: this.state.projectDir, timeoutMs, signal: this.controller.signal, onEvent });
      this.controller = null;
      if (this.state.stage === 'stopped' || result.aborted) return null;
      this.setActive(null);
      if (result.ok) {
        this.say(agent, result.text, { to: typeof to === 'function' ? to(result.text) : to });
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

  async jsonTurn(agent, prompt, activity, validate, to = []) {
    let text = await this.turn(agent, 'read', prompt, activity, to);
    if (text === null) return null;
    let parsed = this.parseWith(text, validate);
    if (parsed.ok) return parsed.value;
    this.say('room', `Invalid answer: ${parsed.error} Asking once more.`);
    text = await this.turn(agent, 'read', `${prompt}\n\nYour previous answer was rejected: ${parsed.error}\nReply again with only the corrected json block.`, activity, to);
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
    const roles = await this.jsonTurn('codex', this.prompt('roles', 'codex'), 'proposing roles', validateRoles, []);
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
    const plan = await this.jsonTurn(roles.orchestrator, this.prompt('plan', roles.orchestrator), 'planning', v => validatePlan(v, roles.coders), []);
    if (!plan) return;
    this.setPlan(plan.tasks, 'plan: initial plan', plan.options);
    this.state.stage = 'gate-plan';
    this.save();
    this.say('room', 'Plan ready. Waiting for the owner.');
  }

  setPlan(tasks, message, options = []) {
    this.state.plan = { tasks: tasks.map(t => ({ ...t, status: 'pending', attempts: 0, reassigned: false, commit: null, notes: '' })), options };
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
    if (task.status !== 'review') {
      rollback(state.projectDir);
      task.status = 'running';
      this.save();
      const before = headCommit(state.projectDir);
      this.say('room', `Task ${task.id}: ${task.title} → ${AGENT_NAMES[task.assignee]}`, { kind: 'assign', by: state.roles.orchestrator, to: [task.assignee] });
      const text = await this.turn(task.assignee, 'edit', this.prompt('build', task.assignee, { task }), 'editing',
        state.roles.reviewer ? [state.roles.reviewer] : [state.roles.orchestrator]);
      if (text === null) return;
      const message = `task-${task.id}: ${task.title}`;
      // Codex and agy can run git commit themselves; their commits count as the task's changes.
      const hash = commitAll(state.projectDir, message) ?? (headCommit(state.projectDir) !== before ? headCommit(state.projectDir) : null);
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
    const verdict = await this.jsonTurn(reviewer, this.prompt('review', reviewer, { task, diff: lastCommitDiff(state.projectDir) }), 'reviewing', validateVerdict, [task.assignee]);
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
    writeFileSync(join(this.state.projectDir, 'SUMMARY.md'), `${text}\n`, 'utf8');
    const hash = commitAll(this.state.projectDir, 'docs: summary');
    if (hash) this.say('room', `Committed ${hash} "docs: summary".`);
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

  gate({ gate, decision, roles, plan, note } = {}) {
    const state = this.state;
    if (GATES[state.stage] !== gate || state.pause) throw roomError('GATE_NOT_OPEN');
    if (decision === 'revise' && gate !== 'result') {
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
        const checked = validateRoles(roles);
        if (!checked.ok) throw roomError('ROLES_INVALID', checked.error);
        const { options, ...chosen } = checked.value;
        state.roles = chosen;
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
    await this.loop;
    // A debate folder is the owner's own repo: never reset or clean it.
    if (this.state.mode === 'debate') return;
    // Committed work stays; anything half-written by the killed turn goes.
    rollback(this.state.projectDir);
  }
}
