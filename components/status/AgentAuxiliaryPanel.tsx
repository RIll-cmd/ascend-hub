"use client";

import { useState, type ReactNode, type Ref } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, ChevronRight, Copy, RefreshCw, X } from "lucide-react";
import type { AgentAuxiliaryModel } from "./agent-auxiliary-model";
import type { StatusMediaIssue } from "./ShelfStatusTv";

export interface AgentAuxiliaryPanelProps {
  model: AgentAuxiliaryModel;
  open: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  refreshError?: string | null;
  mediaIssue?: StatusMediaIssue;
  compactTv?: ReactNode;
}

export function AgentAuxiliaryPanel({ model, open, reduceMotion, onClose, closeRef,
  onRefresh, refreshing = false, refreshError, mediaIssue, compactTv }: AgentAuxiliaryPanelProps) {
  const [copyResult, setCopyResult] = useState<"idle" | "copied" | "failed">("idle");
  const [refreshRequested, setRefreshRequested] = useState(false);
  const [refreshComplete, setRefreshComplete] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(model.copyText);
      setCopyResult("copied");
    } catch { setCopyResult("failed"); }
  }
  async function handleRefresh() {
    setRefreshRequested(true);
    setRefreshComplete(false);
    setRefreshFailed(false);
    try { await onRefresh?.(); setRefreshComplete(true); }
    catch { setRefreshFailed(true); }
    finally { setRefreshRequested(false); }
  }
  const pending = refreshing || refreshRequested;
  const StatusIcon = /unavailable|attention|error/i.test(model.presentation.heading) ? AlertTriangle : Activity;

  return <aside className={`agent-auxiliary-panel tv-inspector ${open ? "is-open" : ""} ${reduceMotion ? "reduce-motion" : ""}`}
    aria-labelledby={model.headingId} data-channel={model.channel}>
    <header className="tv-inspector__chrome">
      <span className="tv-inspector__lights" aria-hidden="true"><i /><i /><i /></span>
      <span className="tv-inspector__address">{model.channel} / {model.serviceLabel}</span>
      <button ref={closeRef} type="button" className="shelf-camera-exit" onClick={onClose}>
        <X size={16} aria-hidden="true" /> Close
      </button>
    </header>
    <div className="tv-inspector__menubar"><span><Activity size={16} aria-hidden="true" /> Status monitor</span><span>Ascend OS</span></div>
    <div className="tv-inspector__desktop">
    {compactTv ? <motion.div className="agent-auxiliary-panel__monitor"
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.7, filter: reduceMotion ? "blur(0px)" : "blur(7px)" }}
      animate={{ opacity: open ? 1 : 0, scale: reduceMotion || open ? 1 : 0.94, filter: "blur(0px)" }}
      transition={{ duration: reduceMotion ? 0.14 : open ? 0.52 : 0.18, ease: [0.16, 1, 0.3, 1] }}>
      <div className="agent-auxiliary-panel__compact-tv">{compactTv}</div>
    </motion.div> : null}
    <div className="agent-auxiliary-panel__console">
    <header className="agent-auxiliary-panel__header">
      <h2 id={model.headingId}>{model.serviceLabel}</h2>

    </header>
    <div className="agent-auxiliary-panel__status-row">
      <span className="agent-auxiliary-panel__row-icon"><StatusIcon size={18} aria-hidden="true" /></span>
      <div><div className="agent-auxiliary-panel__state"><strong>{model.presentation.heading}</strong></div>
        <p className="agent-auxiliary-panel__detail">{model.presentation.explanation}</p></div>
    </div>
    {model.activity ? <section className="agent-auxiliary-panel__activity agent-auxiliary-panel__list-item">
      <span className="agent-auxiliary-panel__row-icon"><Activity size={17} aria-hidden="true" /></span>
      <div><h3>Current activity</h3><p>{model.activity}</p>
        {model.progress !== undefined && model.progress !== null ? <p className="agent-auxiliary-panel__progress">Progress: {model.progress}%</p> : null}
      </div>
    </section> : null}
    {model.issue ? <section className="agent-auxiliary-panel__activity agent-auxiliary-panel__list-item">
      <span className="agent-auxiliary-panel__row-icon"><AlertTriangle size={17} aria-hidden="true" /></span>
      <div><h3>Reported issue</h3><p>{model.issue}</p>
      {model.retryable !== undefined ? <p>{model.retryable ? "Retry available" : "Manual review needed"}</p> : null}</div>
    </section> : null}
    {mediaIssue ? <p className="agent-auxiliary-panel__feedback agent-auxiliary-panel__list-item">{mediaIssue === "autoplay"
      ? "Status video playback was blocked. The reported status is shown above."
      : "Status video unavailable. The reported status is shown above."}</p> : null}
    <div className="agent-auxiliary-panel__actions">
      <button className="agent-auxiliary-panel__list-row" type="button" onClick={handleRefresh} disabled={pending || !onRefresh}>
        <span className="agent-auxiliary-panel__row-icon"><RefreshCw size={17} aria-hidden="true" /></span>
        <span className="agent-auxiliary-panel__row-copy"><strong>{pending ? "Refreshing…" : "Refresh"}</strong><small>Check the latest status report</small></span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      <button className="agent-auxiliary-panel__list-row" type="button" onClick={handleCopy}>
        <span className="agent-auxiliary-panel__row-icon"><Copy size={17} aria-hidden="true" /></span>
        <span className="agent-auxiliary-panel__row-copy"><strong>{copyResult === "copied" ? "Copied" : "Copy status"}</strong><small>Copy this report and its freshness</small></span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </div>
    <p className="agent-auxiliary-panel__feedback" aria-live="polite" aria-atomic="true">
      {pending ? "Checking the status feed…" : (refreshComplete && refreshError) || refreshFailed ? "Refresh failed. Try Refresh again." : refreshComplete ? "Status feed refreshed." : ""}
      {copyResult === "failed" ? " Could not copy. Allow clipboard access and try Copy status again." : ""}
      {copyResult === "copied" ? " Status copied." : ""}
    </p>
    {model.signals.length ? <details className="agent-auxiliary-panel__diagnostics">
      <summary><span className="agent-auxiliary-panel__row-icon"><Activity size={16} aria-hidden="true" /></span>More details<ChevronRight size={16} aria-hidden="true" /></summary>
      <dl className="agent-auxiliary-panel__signals">{model.signals.map(signal => <div key={signal.label} data-tone={signal.tone}>
        <dt>{signal.label}</dt><dd>{signal.value}</dd>
      </div>)}</dl>
    </details> : null}
    </div>
    </div>
  </aside>;
}
