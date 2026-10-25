import { phoneActions } from './phone.mjs';

// A phone push through ntfy (https://ntfy.sh or a self-hosted server) whenever the room starts waiting for the owner.
// The gate summary is sent to that server, so the topic should be private and hard to guess.
// With "answer": true the push also carries one-tap answers, which the phone posts to a second private topic ("reply",
// by default the push topic plus "-reply") that the room polls; see phone.mjs.

function topicUrl(value) {
  let parsed = null;
  try { parsed = typeof value === 'string' ? new URL(value) : null; } catch { /* invalid */ }
  return parsed && ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password && parsed.pathname.length >= 2 && !parsed.search ? parsed : null;
}

export function cleanNotify(value, warn = console.warn) {
  if (value === undefined || value === null) return null;
  const push = topicUrl(value?.ntfy);
  if (!push) {
    warn('settings.json: "notify.ntfy" must be a topic URL such as https://ntfy.sh/<private-topic>; phone pushes are off.');
    return null;
  }
  if (value.answer === undefined || value.answer === false) return { ntfy: push.href };
  if (value.answer !== true) {
    warn('settings.json: "notify.answer" must be true or false; answering from the phone is off.');
    return { ntfy: push.href };
  }
  const reply = value.reply === undefined ? new URL(`${push.pathname.replace(/\/$/, '')}-reply`, push) : topicUrl(value.reply);
  if (!reply || reply.href === push.href) {
    warn('settings.json: "notify.reply" must be a different topic URL; answering from the phone is off.');
    return { ntfy: push.href };
  }
  return { ntfy: push.href, answer: true, reply: reply.href };
}

// What the push says: a short ASCII title (it travels in a header) and the summary the owner would hear from Vision.
export function ntfyMessage(attention, state) {
  const title = attention.kind === 'pause' ? 'Agent Room paused' : `Agent Room: ${attention.gate} gate`;
  const body = `${state.project ?? 'Session'}: ${attention.summary}`.slice(0, 1000);
  return { title, body };
}

const post = (fetchImpl, url, body, headers, warn) => Promise.resolve()
  .then(() => fetchImpl(url, { method: 'POST', body, headers, signal: AbortSignal.timeout(10_000) }))
  .then(res => { if (!res.ok) warn(`ntfy push failed: HTTP ${res.status}`); }, error => warn(`ntfy push failed: ${error.message}`));

// Returns the callback a session calls with each new attention, or null when pushes are off. Failures are logged, never thrown.
export function attentionNotifier(notify, fetchImpl = globalThis.fetch, warn = console.warn) {
  if (!notify?.ntfy) return null;
  return (attention, state) => {
    const { title, body } = ntfyMessage(attention, state);
    const headers = { Title: title, Tags: 'robot', Priority: 'high' };
    let text = body;
    if (notify.answer && state.phone?.code) {
      const { actions, line } = phoneActions(attention, state.phone.code, notify.reply);
      if (actions) headers.Actions = actions;
      text = `${body}\n\n${line}`;
    }
    post(fetchImpl, notify.ntfy, text, headers, warn);
  };
}

// A short follow-up push, such as the outcome of an answer sent from the phone.
export function phonePush(notify, text, fetchImpl = globalThis.fetch, warn = console.warn) {
  if (notify?.ntfy) post(fetchImpl, notify.ntfy, text, { Title: 'Agent Room', Tags: 'robot' }, warn);
}
