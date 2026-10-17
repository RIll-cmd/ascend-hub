import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { killTree } from './agents.mjs';
import { roomError } from './paths.mjs';

// An app preview for design reviews: the owner's start command and the URL it serves.
// Only loopback URLs, so the room never points a browser at another host.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validatePreview(value) {
  if (value === undefined || value === null) return null;
  const command = typeof value?.command === 'string' ? value.command.trim() : '';
  if (!command || command.length > 500) throw roomError('PREVIEW_INVALID', 'The preview needs a start command of at most 500 characters.');
  let url;
  try { url = new URL(value.url); } catch { throw roomError('PREVIEW_INVALID', 'The preview URL is not a URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK.has(url.hostname)) throw roomError('PREVIEW_INVALID', 'The preview URL must be http://localhost or 127.0.0.1.');
  return { command, url: url.href };
}

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

// settings.browser ({ command, prefixArgs }) wins; otherwise the first installed Edge or Chrome.
export function findBrowser(settings, candidates = BROWSERS) {
  if (settings?.browser) return settings.browser;
  const command = candidates.find(path => existsSync(path));
  return command ? { command, prefixArgs: [] } : null;
}

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

function run(command, args, options, timeoutMs, signal) {
  return new Promise(resolve => {
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: 'ignore' });
    const stop = () => killTree(child);
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    child.on('error', error => { clearTimeout(timer); resolve({ code: null, error: error.message }); });
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve({ code }); });
  });
}

// Starts the app, waits until the URL answers, takes a 1280x800 headless screenshot, and always stops the app.
export async function capturePreview({ dir, command, url, outFile, browser, timeoutMs = 60_000, signal }) {
  if (!browser) return { ok: false, error: 'No Edge or Chrome was found; set settings.browser.' };
  const app = spawn(command, { cwd: dir, shell: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' } });
  let exited = false;
  app.on('exit', () => { exited = true; });
  app.on('error', () => { exited = true; });
  // One reused throwaway profile: Edge's helper processes can hold it for a while after the screenshot, so it is never deleted.
  const profile = join(tmpdir(), 'ascend-room-preview-profile');
  try {
    const deadline = Date.now() + timeoutMs;
    let up = false;
    while (!up && !exited && !signal?.aborted && Date.now() < deadline) {
      up = await fetch(url, { signal: AbortSignal.timeout(2000) }).then(r => r.status < 500, () => false);
      if (!up) await sleep(400);
    }
    if (signal?.aborted) return { ok: false, error: 'stopped' };
    if (!up) return { ok: false, error: exited ? `the start command exited before ${url} answered` : `${url} did not answer within ${Math.round(timeoutMs / 1000)}s` };
    mkdirSync(dirname(outFile), { recursive: true });
    rmSync(outFile, { force: true });
    // The separate profile keeps the owner's browser profile untouched; the time budget lets client-side code render.
    const args = [...browser.prefixArgs, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--virtual-time-budget=5000', '--window-size=1280,800', `--screenshot=${outFile}`, url];
    const shot = await run(browser.command, args, {}, 30_000, signal);
    // Edge's launcher can exit at once and hand the work to a relaunched process, so wait for a finished file.
    const until = Date.now() + 30_000;
    let size = -1;
    while (!shot.error && !signal?.aborted && Date.now() < until) {
      const now = existsSync(outFile) ? statSync(outFile).size : -1;
      if (now > 0 && now === size) return { ok: true };
      size = now;
      await sleep(300);
    }
    return { ok: false, error: shot.error ?? `the browser saved no screenshot (exit ${shot.code ?? 'none'})` };
  } finally {
    killTree(app);
  }
}
