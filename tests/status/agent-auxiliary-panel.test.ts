import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentAuxiliaryPanel } from "../../components/status/AgentAuxiliaryPanel";
import { buildAgentAuxiliaryModel } from "../../components/status/agent-auxiliary-model";
import { getCrtProfile } from "../../components/crt-tv-config";
import { ShelfStatusTv } from "../../components/status/ShelfStatusTv";

const input = {
  assignment: { channel: "CH 03", serviceId: "codex-cli" } as const,
  service: {
    serviceId: "codex-cli", instanceId: "codex-local-1", serviceType: "agent" as const,
    state: "working" as const, stateSince: "2026-09-22T01:58:00.000Z",
    lastHeartbeatAt: "2026-09-22T01:59:52.000Z", staleAfterSeconds: 30,
    activity: { kind: "agent-turn", label: "Generating answer", progress: 42 },
  },
  loading: false, error: null, stale: false, nowMs: Date.parse("2026-09-22T02:00:00.000Z"),
};
const model = buildAgentAuxiliaryModel(input);
const render = (override = {}) => renderToStaticMarkup(createElement(AgentAuxiliaryPanel, {
  model, open: true, reduceMotion: false, onClose() {}, onRefresh: async () => {}, ...override,
}));

test("focused details use the shared state, one explanation and one Close action", () => {
  const markup = render();
  assert.match(markup, /aria-labelledby="agent-console-codex-cli"/);
  assert.match(markup, /<h2[^>]+id="agent-console-codex-cli"[^>]*>CODEX CLI<\/h2>/);
  assert.match(markup, />Working</);
  assert.match(markup, />Generating answer</);
  assert.match(markup, /Progress: 42%/);
  assert.equal((markup.match(/Latest report:/g) ?? []).length, 1);
  assert.equal((markup.match(/> Close</g) ?? []).length, 1);
  assert.match(markup, />Refresh</);
  assert.match(markup, /Copy status/);
  assert.doesNotMatch(markup, /ZOOM OUT|NO SIGNAL|SIGNAL TRACE|CONTENT CHANNEL SEALED/);
  assert.match(markup, /aria-live="polite"/);
});

test("focused details place the CRT beside one compact control console", () => {
  const markup = render({ compactTv: createElement("div", { id: "fixture-monitor" }, "CRT status video") });
  const monitor = markup.indexOf("agent-auxiliary-panel__monitor");
  const console = markup.indexOf("agent-auxiliary-panel__console");
  assert.ok(monitor >= 0, "the status CRT has a dedicated monitor frame");
  assert.ok(console > monitor, "the status and controls form the right-side console");
  assert.ok(markup.indexOf("fixture-monitor") > monitor);
  assert.ok(markup.indexOf("Refresh") > console);
  assert.ok(markup.indexOf("Copy status") > console);
  assert.equal((markup.match(/> Close</g) ?? []).length, 1);
});

test("details retain the selected shelf TV artwork and its square screen crop", async () => {
  const profile = getCrtProfile("imac-g3-bondi");
  assert.ok(profile);
  const tv = createElement(ShelfStatusTv, { assignment: input.assignment, profile,
    service: null, loading: false, error: null, stale: false });
  const markup = render({ compactTv: tv });
  const styles = await readFile("app/globals.css", "utf8");
  assert.match(markup, /class="agent-auxiliary-panel__monitor"[\s\S]*class="crt-tv-frame" src="\/crt-tvs-and-imac\/imac1-removebg-preview\.png"/);
  assert.match(markup, /width:66\.0%;height:49\.5%/);
  assert.doesNotMatch(styles, /agent-auxiliary-panel__monitor \.crt-tv-frame\s*\{\s*display:\s*none/);
  assert.doesNotMatch(styles, /agent-auxiliary-panel__monitor \.crt-screen\s*\{[^}]*width:\s*90%/);
  assert.match(styles, /\.agent-auxiliary-panel \{[^}]*repeating-linear-gradient/);
});

test("the status side uses compact item-style rows for status and actions", () => {
  const markup = render();
  assert.match(markup, /class="agent-auxiliary-panel__status-row"/);
  assert.match(markup, /class="agent-auxiliary-panel__list-row"[^>]*>[\s\S]*Refresh/);
  assert.match(markup, /class="agent-auxiliary-panel__list-row"[^>]*>[\s\S]*Copy status/);
});

test("focused TV and dialogue panel use a coordinated zoom-in with a fast pullback", async () => {
  const markup = await readFile("app/page.tsx", "utf8");
  const panel = await readFile("components/status/AgentAuxiliaryPanel.tsx", "utf8");
  assert.match(markup, /initial=\{\{ opacity: 0, y: reduceMotion \? 0 : 20, scale: reduceMotion \? 1 : 0\.94 \}\}/);
  assert.match(markup, /focusedStatusTv\.open \? 0\.42 : 0\.2/);
  assert.match(panel, /className="agent-auxiliary-panel__monitor"[\s\S]*?scale: reduceMotion \? 1 : 0\.7/);
  assert.match(panel, /filter: reduceMotion \? "blur\(0px\)" : "blur\(7px\)"/);
  assert.match(panel, /duration: reduceMotion \? 0\.14 : open \? 0\.52 : 0\.18/);
});

test("diagnostics are optional disclosure content and absent activity has no filler", () => {
  const markup = render({ model: buildAgentAuxiliaryModel({ ...input, service: { ...input.service, activity: undefined } }) });
  assert.match(markup, /<details[^>]*><summary>[\s\S]*More details[\s\S]*<\/summary>/);
  assert.match(markup, />LAST HEARTBEAT</);
  assert.match(markup, />8S AGO</);
  assert.match(markup, />codex-local-1</);
  assert.doesNotMatch(markup, /Current activity|OPERATION ACTIVE|PROGRESS|<textarea|<input|>SEND</i);
});

test("missing telemetry has one reason and no duplicate feed badges", () => {
  const markup = render({ model: buildAgentAuxiliaryModel({ ...input, service: null, error: "unavailable" }) });
  assert.match(markup, />Status unavailable</);
  assert.equal((markup.match(/Cannot reach the status feed/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /STATUS FEED|NO SIGNAL|Current activity|OPERATION ACTIVE/);
});

test("refresh pending and media failure stay separate from lifecycle", () => {
  const markup = render({ refreshing: true, mediaIssue: "autoplay" });
  assert.match(markup, />Working</);
  assert.match(markup, /disabled=""[^>]*>[\s\S]*Refreshing…/);
  assert.match(markup, /Checking the status feed/);
  assert.match(markup, /Status video playback was blocked/);
  assert.doesNotMatch(markup, />Offline</);
});

test("a lost selection preserves its instance in diagnostics and copied status", () => {
  const missing = buildAgentAuxiliaryModel({ ...input, service: null, selectedInstanceId: "codex-local-1" });
  const markup = render({ model: missing });
  assert.match(markup, /selected instance is no longer reported/);
  assert.match(markup, />codex-local-1</);
  assert.match(missing.copyText, /INSTANCE: codex-local-1/);
  assert.doesNotMatch(missing.copyText, /STATE: Offline|STATE: Working/);
});

test("reported issues retain retry information and reduced-motion class", () => {
  const markup = render({ reduceMotion: true, model: buildAgentAuxiliaryModel({
    ...input, service: { ...input.service, state: "stuck", issue: { code: "waiting", message: "Waiting for input", retryable: true } },
  }) });
  assert.match(markup, /reduce-motion/);
  assert.match(markup, />Needs attention</);
  assert.match(markup, />Waiting for input</);
  assert.match(markup, /Retry available/);
});


test("TV inspectors provide a retro desktop and channel-specific palette with one Close control", async () => {
  const styles = await readFile("components/status/tv-inspector.css", "utf8");
  for (const channel of ["CH 01", "CH 02", "CH 03", "CH 04"] as const) {
    const markup = render({ model: { ...model, channel } });
    assert.match(markup, new RegExp(`data-channel="${channel}"`));
    assert.match(markup, /tv-inspector__chrome/);
    assert.match(markup, /tv-inspector__menubar/);
    assert.match(markup, /tv-inspector__desktop/);
    assert.equal((markup.match(/> Close</g) ?? []).length, 1);
  }
  assert.match(styles, /data-channel="CH 04"[^}]*--desktop-a: #739fdc/);
});
