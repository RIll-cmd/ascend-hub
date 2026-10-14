"use client";
import { useMemo, useState } from "react";
import { useNow } from "../status/use-now";
import { AGENT_COLORS, messageLine } from "./deck/deck-view";
import { AGENT_NAMES, type SessionView } from "./room-types";
import { formatMs, workflowView, type WorkflowTask } from "./workflow-view";

// Three or more coder rounds on one task usually means the coder and reviewer are going in circles.
const LOOPING = 3;

function DiffView({ commit }: { commit: string }) {
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
      <button type="button" className="agent-room-link" onClick={() => void load()} disabled={state.loading}>{state.loading ? "Loading changes…" : `Show changes (${commit})`}</button>
      {state.error && <span role="alert" className="agent-room-error"> {state.error}</span>}
    </p>
  );
}

function TaskNode({ task }: { task: WorkflowTask }) {
  const looping = task.rounds >= LOOPING;
  return (
    <li className={`agent-room-wf-task is-${task.status}${looping ? " is-looping" : ""}`} style={{ borderLeftColor: AGENT_COLORS[task.assignee] }}>
      <details>
        <summary>
          <span className="agent-room-wf-title">{task.id}. {task.title}</span>
          <span className="agent-room-wf-meta">
            <b style={{ color: AGENT_COLORS[task.assignee] }}>{AGENT_NAMES[task.assignee]}</b>
            <span className="agent-room-badge">{task.status}</span>
            {task.rounds > 0 && <span className="agent-room-badge" title="Coder rounds on this task">{task.rounds} round{task.rounds === 1 ? "" : "s"}{looping ? " · looping?" : ""}</span>}
            {task.reviews > 0 && <span className="agent-room-badge" title="Reviewer replies">{task.reviews} review{task.reviews === 1 ? "" : "s"}</span>}
            {task.ms !== null && <span>{formatMs(task.ms)}</span>}
          </span>
        </summary>
        {task.notes && <p className="agent-room-hint">Last note: {task.notes}</p>}
        {task.messages.length > 0 ? (
          <ol className="agent-room-wf-loop">
            {task.messages.map(m => {
              const line = messageLine(m);
              return <li key={m.seq ?? m.at}><b>{line.from}{line.to ? ` → ${line.to}` : ""}</b> {line.text.slice(0, 280)}</li>;
            })}
          </ol>
        ) : <p className="agent-room-hint">Not started yet.</p>}
        {task.commit && <DiffView commit={task.commit} />}
      </details>
    </li>
  );
}

export function WorkflowPanel({ session }: { session: SessionView }) {
  const now = useNow(1000);
  const view = useMemo(() => workflowView(session, now), [session, now]);
  return (
    <section className="agent-room-workflow" aria-label="Workflow">
      <ol className="agent-room-wf-stages">
        {view.stages.map(stage => (
          <li key={stage.label} className={`is-${stage.state}`}>
            <span>{stage.label}</span>
            {stage.ms !== null && <small>{formatMs(stage.ms)}</small>}
          </li>
        ))}
      </ol>
      {view.tasks.length > 0
        ? <ol className="agent-room-wf-tasks">{view.tasks.map(task => <TaskNode key={task.id} task={task} />)}</ol>
        : <p className="agent-room-hint">{session.mode === "debate" ? "Debates have no tasks; see the Debate tab." : "Tasks appear here once the plan is ready."}</p>}
    </section>
  );
}
