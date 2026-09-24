"use client";

import { useState } from "react";
import { Copy, Radio, X } from "lucide-react";
import type { AgentAuxiliaryModel } from "./agent-auxiliary-model";

export interface AgentAuxiliaryPanelProps {
  model: AgentAuxiliaryModel;
  open: boolean;
  reduceMotion: boolean;
  onClose: () => void;
}

export function AgentAuxiliaryPanel({ model, open, reduceMotion, onClose }: AgentAuxiliaryPanelProps) {
  const [copyResult, setCopyResult] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(model.copyText);
      setCopyResult("copied");
    } catch {
      setCopyResult("failed");
    }
  }

  return (
    <aside
      className={`agent-auxiliary-panel ${open ? "is-open" : ""} ${reduceMotion ? "reduce-motion" : ""}`}
      aria-labelledby={model.headingId}
    >
      <div className="agent-auxiliary-panel__scanlines" aria-hidden="true" />
      <header className="agent-auxiliary-panel__header">
        <div>
          <span className="agent-auxiliary-panel__eyebrow">HDD AUXILIARY PROGRAM</span>
          <h2 id={model.headingId}>{model.serviceLabel}</h2>
        </div>
        <span className={`agent-auxiliary-panel__signal is-${model.signalLabel.toLowerCase().replace(" ", "-")}`}>
          <Radio size={13} aria-hidden="true" /> {model.signalLabel}
        </span>
      </header>

      <div className="agent-auxiliary-panel__state" role="status">
        <span className="agent-auxiliary-panel__state-symbol" aria-hidden="true">{model.stateSymbol}</span>
        <div>
          <small>{model.channel} · AGENT STATE</small>
          <strong>{model.stateLabel}</strong>
        </div>
      </div>

      <p className="agent-auxiliary-panel__detail">{model.detail}</p>

      <div className="agent-auxiliary-panel__divider" aria-hidden="true">
        <span /> SIGNAL TRACE <span />
      </div>

      <dl className="agent-auxiliary-panel__signals">
        {model.signals.map(signal => (
          <div key={signal.label} data-tone={signal.tone}>
            <dt>{signal.label}</dt>
            <dd>{signal.value}</dd>
          </div>
        ))}
      </dl>

      <div className="agent-auxiliary-panel__actions">
        <button type="button" onClick={handleCopy}>
          <Copy size={14} aria-hidden="true" /> COPY STATUS
        </button>
        <button type="button" onClick={onClose}>
          <X size={14} aria-hidden="true" /> ZOOM OUT
        </button>
      </div>

      <p className="agent-auxiliary-panel__privacy">READ-ONLY SIGNAL · CONTENT CHANNEL SEALED</p>
      <span className="agent-auxiliary-panel__announcement" aria-live="polite" aria-atomic="true">
        {copyResult === "copied" ? "STATUS COPIED" : copyResult === "failed" ? "COPY FAILED" : ""}
      </span>
    </aside>
  );
}
