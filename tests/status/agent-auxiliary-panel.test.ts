import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentAuxiliaryModel } from "../../components/status/agent-auxiliary-model";
import { AgentAuxiliaryPanel } from "../../components/status/AgentAuxiliaryPanel";

const model: AgentAuxiliaryModel = {
  headingId: "agent-console-codex-cli",
  channel: "CH 03",
  serviceLabel: "CODEX CLI",
  stateLabel: "WORKING",
  stateSymbol: "▶",
  detail: "Generating answer",
  signalLabel: "LIVE",
  signals: [
    { label: "STATE SINCE", value: "2M AGO", tone: "normal" },
    { label: "LAST HEARTBEAT", value: "8S AGO", tone: "positive" },
  ],
  copyText: "CODEX CLI · CH 03\nSTATE: WORKING",
};

test("renders the focused service console with safe actions", () => {
  const markup = renderToStaticMarkup(createElement(AgentAuxiliaryPanel, {
    model,
    open: true,
    reduceMotion: false,
    onClose() {},
  }));

  assert.match(markup, /aria-labelledby="agent-console-codex-cli"/);
  assert.match(markup, /<h2[^>]+id="agent-console-codex-cli"[^>]*>CODEX CLI<\/h2>/);
  assert.match(markup, />WORKING</);
  assert.match(markup, />Generating answer</);
  assert.match(markup, /COPY STATUS/);
  assert.match(markup, /ZOOM OUT/);
  assert.match(markup, /aria-live="polite"/);
});

test("renders every safe signal as text without conversation controls", () => {
  const markup = renderToStaticMarkup(createElement(AgentAuxiliaryPanel, {
    model,
    open: true,
    reduceMotion: true,
    onClose() {},
  }));

  assert.match(markup, />STATE SINCE</);
  assert.match(markup, />2M AGO</);
  assert.match(markup, />LAST HEARTBEAT</);
  assert.match(markup, />8S AGO</);
  assert.doesNotMatch(markup, /<textarea/i);
  assert.doesNotMatch(markup, /<input/i);
  assert.doesNotMatch(markup, />SEND</i);
  assert.doesNotMatch(markup, /transcript/i);
});
