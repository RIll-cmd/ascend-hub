// A phone push through ntfy (https://ntfy.sh or a self-hosted server) whenever the room starts waiting for the owner.
// The gate summary is sent to that server, so the topic should be private and hard to guess.

export function cleanNotify(value, warn = console.warn) {
  if (value === undefined || value === null) return null;
  const url = typeof value?.ntfy === 'string' ? value.ntfy : null;
  let parsed = null;
  try { parsed = url ? new URL(url) : null; } catch { /* reported below */ }
  if (!parsed || !['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname.length < 2 || parsed.search) {
    warn('settings.json: "notify.ntfy" must be a topic URL such as https://ntfy.sh/<private-topic>; phone pushes are off.');
    return null;
  }
  return { ntfy: parsed.href };
}

// What the push says: a short ASCII title (it travels in a header) and the summary the owner would hear from Vision.
export function ntfyMessage(attention, state) {
  const title = attention.kind === 'pause' ? 'Agent Room paused' : `Agent Room: ${attention.gate} gate`;
  const body = `${state.project ?? 'Session'}: ${attention.summary}`.slice(0, 1000);
  return { title, body };
}

// Returns the callback a session calls with each new attention, or null when pushes are off. Failures are logged, never thrown.
export function attentionNotifier(notify, fetchImpl = globalThis.fetch, warn = console.warn) {
  if (!notify?.ntfy) return null;
  return (attention, state) => {
    const { title, body } = ntfyMessage(attention, state);
    Promise.resolve()
      .then(() => fetchImpl(notify.ntfy, { method: 'POST', body, headers: { Title: title, Tags: 'robot', Priority: 'high' }, signal: AbortSignal.timeout(10_000) }))
      .then(res => { if (!res.ok) warn(`ntfy push failed: HTTP ${res.status}`); }, error => warn(`ntfy push failed: ${error.message}`));
  };
}
