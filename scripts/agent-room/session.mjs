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
    await this.loop;
    // Committed work stays; anything half-written by the killed turn goes.
    rollback(this.state.projectDir);
  }
}
