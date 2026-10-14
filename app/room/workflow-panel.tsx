"use client";
import { useMemo, useState } from "react";
import { useNow } from "../status/use-now";
import { AGENT_COLORS, messageLine } from "./deck/deck-view";
import { AGENT_IDS, AGENT_NAMES, type SessionView } from "./room-types";
import { formatMs, formatTokens, LOOPING, workflowView, type Lanes, type RunSummary, type WorkflowTask } from "./workflow-view";

export function DiffView({ commit, label }: { commit: string; label?: string }) {
  const [state, setState] = useState<{ text?: string; error?: string; loading?: boolean }>({});
  const load = async () => {
    setState({ loading: true });
    try {
      const res = await fetch(`/api/room/sessions/current/diff?commit=${encodeURIComponent(commit)}`, { cache: "no-store" });
      const data = await res.json() as { text?: string; error?: string };
      setState(res.ok && data.text ? { text: data.text } : { error: data.error ?? `Request failed (${res.status})` });
    } catch {
      setState({ error: "Hub could not be reached." });
    }
  };
  if (state.text !== undefined) {
    return (
      <pre className="agent-room-diff" aria-label={`Changes in ${commit}`}>
        {state.text.split("\n").map((line, i) => (
          <span key={i} className={line.startsWith("+") && !line.startsWith("+++") ? "is-add" : line.startsWith("-") && !line.startsWith("---") ? "is-del" : undefined}>{line}{"\n"}</span>
        ))}
      </pre>
    );
  }
  return (
    <p>
      <button type="button" className="agent-room-link" onClick={() => void load()} disabled={state.loading}>{state.loading ? "Loading changes…" : label ?? `Show changes (${commit})`}</button>
      {state.error && <span role="alert" className="agent-room-error"> {state.error}</span>}
    </p>
  );
}

function TaskNode({ task }: { task: WorkflowTask }) {
  const looping = task.rounds >= LOOPING;
  return (
    <li className={`agent-room-wf-task is-${task.status}${looping ? " is-looping" : ""}${task.needsAttention ? " needs-attention" : ""}`} style={{ borderLeftColor: AGENT_COLORS[task.assignee] }}>
      <details>
        <summary>
          <span className="agent-room-wf-title">{task.id}. {task.title}</span>
          <span className="agent-room-wf-meta">
            <b style={{ color: AGENT_COLORS[task.assignee] }}>{AGENT_NAMES[task.assignee]}</b>
            <span className="agent-room-badge">{task.status}</span>
            {task.rounds > 0 && <span className="agent-room-badge" title="Coder rounds on this task">{task.rounds} round{task.rounds === 1 ? "" : "s"}{looping ? " · looping?" : ""}</span>}
            {task.reviews > 0 && <span className="agent-room-badge" title="Reviewer replies">{task.reviews} review{task.reviews === 1 ? "" : "s"}</span>}
            {task.check && <span className={`agent-room-badge${task.check.ok ? "" : " is-problem"}`}>{task.check.ok ? "checks ✓" : "checks ✗"}</span>}
            {task.tokens > 0 && <span>{formatTokens(task.tokens)} tokens</span>}
            {task.ms !== null && <span>{formatMs(task.ms)}</span>}
          </span>
        </summary>
        {task.check && (
          <p className={task.check.ok ? "agent-room-hint" : "agent-room-hint is-problem"}>
            Checks {task.check.ok ? "passed" : `failed (exit ${task.check.code ?? "none"})`} in {formatMs(task.check.ms)}
          </p>
        )}
        {task.check && !task.check.ok && task.check.output && <pre className="agent-room-diff">{task.check.output.slice(-2000)}</pre>}
        {task.notes && <p className="agent-room-hint">Last note: {task.notes}</p>}
        {task.roundGroups.length > 0 ? task.roundGroups.map((round, i) => (
          <div key={i} className="agent-room-wf-round">
            {task.roundGroups.length > 1 && <h4>Round {i + 1}</h4>}
            <ol className="agent-room-wf-loop">
              {round.map(m => {
                const line = messageLine(m);
                return <li key={m.seq ?? m.at} className={m.from === "room" && /turn failed|^Invalid answer|^Paused:/.test(m.text) ? "is-problem" : undefined}><b>{line.from}{line.to ? ` → ${line.to}` : ""}</b> {line.text.slice(0, 280)}</li>;
              })}
            </ol>
          </div>
        )) : <p className="agent-room-hint">Not started yet.</p>}
        {task.commit && <DiffView commit={task.commit} />}
      </details>
    </li>
  );
}

function Summary({ summary }: { summary: RunSummary }) {
  return (
    <p className="agent-room-wf-summary">
      <b>Run {formatMs(summary.ms) || "not started"}</b>
      {AGENT_IDS.filter(id => summary.turns[id] > 0).map(id => (
        <span key={id} style={{ color: AGENT_COLORS[id] }}>{AGENT_NAMES[id]} {summary.turns[id]} turn{summary.turns[id] === 1 ? "" : "s"}</span>
      ))}
      {AGENT_IDS.some(id => summary.tokens[id] > 0) && (
        <span title="Tokens reported by each CLI; Antigravity does not report usage">
          {AGENT_IDS.filter(id => summary.tokens[id] > 0).map(id => `${AGENT_NAMES[id]} ${formatTokens(summary.tokens[id])}`).join(" · ")} tokens
          {summary.costUsd > 0 ? ` · $${summary.costUsd.toFixed(2)}` : ""}
        </span>
      )}
      {summary.limits && (
        <span title="Session limits; reaching one pauses the room and asks you">
          Turns {summary.limits.turns[0]}/{summary.limits.turns[1]} · Work {summary.limits.minutes[0]}/{summary.limits.minutes[1]} min · Max {summary.limits.rounds} rounds a task
        </span>
      )}
      {summary.retries > 0 && <span>{summary.retries} retr{summary.retries === 1 ? "y" : "ies"}</span>}
      {summary.problems > 0 && <span className="is-problem">{summary.problems} problem{summary.problems === 1 ? "" : "s"}</span>}
    </p>
  );
}

// One row per agent; each bar is a turn, placed on the session's time axis.
function SwimLanes({ lanes }: { lanes: Lanes }) {
  const total = Math.max(1, lanes.end - lanes.start);
  if (!lanes.rows.some(r => r.spans.length)) return null;
  return (
    <div className="agent-room-wf-lanes" role="img" aria-label="When each agent was working">
      {lanes.rows.map(row => (
        <div key={row.agent} className="agent-room-wf-lane">
          <span className="agent-room-wf-lane-name">{AGENT_NAMES[row.agent]}</span>
          <div className="agent-room-wf-lane-track">
            {row.spans.map((span, i) => (
              <i key={i} title={`${AGENT_NAMES[row.agent]}: ${formatMs(span.end - span.start)}`} style={{
                left: `${((span.start - lanes.start) / total) * 100}%`,
                width: `max(2px, ${((span.end - span.start) / total) * 100}%)`,
                background: AGENT_COLORS[row.agent],
              }} />
            ))}
          </div>
        </div>
      ))}
      <div className="agent-room-wf-axis"><span>0s</span><span>{formatMs(lanes.end - lanes.start)}</span></div>
    </div>
  );
}

export function WorkflowPanel({ session }: { session: SessionView }) {
  const now = useNow(1000);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const view = useMemo(() => workflowView(session, now), [session, now]);
  const flagged = view.tasks.filter(t => t.needsAttention).length;
  const tasks = onlyProblems ? view.tasks.filter(t => t.needsAttention) : view.tasks;
  return (
    <section className="agent-room-workflow" aria-label="Workflow">
      <Summary summary={view.summary} />
      <ol className="agent-room-wf-stages">
        {view.stages.map(stage => (
          <li key={stage.label} className={`is-${stage.state}`}>
            <span>{stage.label}</span>
            {stage.ms !== null && <small>{formatMs(stage.ms)}</small>}
          </li>
        ))}
      </ol>
      <SwimLanes lanes={view.lanes} />
      {flagged > 0 && (
        <label className="agent-room-check agent-room-wf-filter">
          <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} />
          Only tasks that need attention ({flagged})
        </label>
      )}
      {view.tasks.length > 0
        ? <ol className="agent-room-wf-tasks">{tasks.map(task => <TaskNode key={task.id} task={task} />)}</ol>
        : <p className="agent-room-hint">{session.mode === "debate" ? "Debates have no tasks; see the Debate tab." : "Tasks appear here once the plan is ready."}</p>}
    </section>
  );
}
