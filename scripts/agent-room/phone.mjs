import { randomInt } from 'node:crypto';
import { parseJsonLine } from './events.mjs';

// Answering gates from the phone, outbound only: the room polls a private ntfy reply topic; nothing listens for the phone.
// Every reply must carry the one-time code of the wait it answers, and only low-risk decisions are allowed.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L to misread
export const CODE_LENGTH = 6;
export const MAX_WRONG = 5;

export const newCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

// What the phone may decide at each wait. Merging, pull requests and rejecting (which deletes a repo branch) stay with
// the Hub page; so does stopping at the result gate, which would leave the result undecided.
export function phoneChoices(attention) {
  if (!attention) return [];
  if (attention.kind === 'pause') return ['retry', 'stop'];
  if (attention.gate === 'roles' || attention.gate === 'plan') return ['approve', 'revise', 'stop'];
  if (attention.gate === 'race') return ['approve', 'stop'];
  if (attention.gate === 'result') return ['keep'];
  return [];
}

// "approve K7Q2XM" or "revise K7Q2XM make task 2 smaller", in any case; null for anything else.
export function parseReply(text) {
  const m = new RegExp(`^\\s*(approve|revise|keep|retry|stop)\\s+([a-z0-9]{${CODE_LENGTH}})(?:\\s+([^]*))?$`, 'i').exec(String(text ?? ''));
  return m ? { decision: m[1].toLowerCase(), code: m[2].toUpperCase(), note: (m[3] ?? '').trim() } : null;
}

const BUTTONS = { approve: 'Approve', keep: 'Keep result', retry: 'Retry', stop: 'Stop' };

// The push's one-tap buttons (ntfy "http" actions the phone sends to the reply topic) and a line for typed answers.
export function phoneActions(attention, code, replyUrl) {
  const choices = phoneChoices(attention);
  const actions = choices.filter(c => BUTTONS[c]).slice(0, 3)
    .map(c => `http, ${BUTTONS[c]}, ${replyUrl}, method=POST, body=${c} ${code}, clear=true`).join('; ');
  const typed = choices.includes('revise') ? ` To ask for changes, publish "revise ${code} <what to change>" to ${replyUrl}.` : '';
  return { actions, line: `Code ${code}.${typed}` };
}

// Polls the reply topic and hands every reply-shaped message to onReply. Messages from before the room started are skipped.
export function replyWatcher({ notify, fetchImpl = globalThis.fetch, onReply, warn = console.warn, everyMs = 10_000 }) {
  if (!notify?.answer || !notify.reply) return null;
  let since = String(Math.floor(Date.now() / 1000));
  let running = false;
  let failing = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const res = await fetchImpl(`${notify.reply}/json?poll=1&since=${encodeURIComponent(since)}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const line of (await res.text()).split('\n')) {
        const message = parseJsonLine(line);
        if (message?.event !== 'message' || typeof message.id !== 'string') continue;
        since = message.id;
        const reply = parseReply(message.message);
        if (reply) await onReply(reply);
      }
      failing = false;
    } catch (error) {
      if (!failing) warn(`ntfy reply poll failed: ${error.message}`);
      failing = true;
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void poll(), everyMs);
  timer.unref?.();
  return { poll, stop: () => clearInterval(timer) };
}
