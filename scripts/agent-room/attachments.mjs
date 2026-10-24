import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { roomError } from './paths.mjs';
import { excludeFromGit } from './project.mjs';

export const ATTACH_DIR = '.ascend/attachments';
const MAX_FILES = 5;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 12 * 1024 * 1024;

// What each allowed extension must start with; text files must simply hold no NUL byte.
const TYPES = {
  png: { kind: 'image', ok: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { kind: 'image', ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { kind: 'image', ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: { kind: 'image', ok: b => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  webp: { kind: 'image', ok: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  pdf: { kind: 'pdf', ok: b => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  md: { kind: 'text', ok: b => !b.includes(0) },
  txt: { kind: 'text', ok: b => !b.includes(0) },
};

// The owner's uploads ({ name, data: base64 }) checked: at most 5, an allowed extension whose bytes match it,
// 8 MB each and 12 MB in all. Names are reduced to safe characters and made unique.
export function cleanAttachments(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > MAX_FILES) throw roomError('ATTACHMENTS_INVALID', `Attach at most ${MAX_FILES} files.`);
  const used = new Set();
  let total = 0;
  return list.map(item => {
    const raw = typeof item?.name === 'string' ? item.name.split(/[\\/]/).pop() : '';
    const ext = /\.([a-z0-9]+)$/i.exec(raw)?.[1].toLowerCase();
    const type = TYPES[ext];
    if (!type || typeof item.data !== 'string') throw roomError('ATTACHMENT_TYPE', `${raw || 'A file'}: attach PNG, JPEG, GIF, WebP, PDF, Markdown or text files.`);
    const bytes = Buffer.from(item.data, 'base64');
    total += bytes.length;
    if (!bytes.length || bytes.length > MAX_FILE || total > MAX_TOTAL) throw roomError('ATTACHMENT_SIZE', `${raw}: at most 8 MB a file and 12 MB in all.`);
    if (!type.ok(bytes)) throw roomError('ATTACHMENT_TYPE', `${raw} is not really a .${ext} file.`);
    let name = raw.slice(0, -ext.length - 1).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'attachment';
    for (let n = 2; used.has(`${name}.${ext}`); n++) name = `${name.replace(/-\d+$/, '')}-${n}`;
    used.add(`${name}.${ext}`);
    return { name: `${name}.${ext}`, kind: type.kind, bytes };
  });
}

// "@diff" and "@path/with.dots" in the task. Plain words after @ (mentions, e-mail addresses) are left alone.
export function taskReferences(task) {
  const refs = [...String(task).matchAll(/(?:^|\s)@(diff\b|[\w-]*(?:[./][\w-]+)+)/g)].map(m => m[1].replace(/[.,;:]+$/, ''));
  return { diff: refs.includes('diff'), files: [...new Set(refs.filter(r => r !== 'diff'))] };
}

// A PDF's text beside it (name.pdf.txt), so agents that cannot open PDFs can read the spec. Tries pdftotext, then
// Python's pypdf from an empty folder (so nothing next to it can shadow a module); null when neither works.
function pdfText(file, settings) {
  const out = `${file}.txt`;
  const run = (command, args, cwd) => spawnSync(command, args, { cwd, timeout: 30_000, windowsHide: true, encoding: 'utf8' });
  if (run('pdftotext', ['-layout', '-enc', 'UTF-8', file, out]).status === 0 && existsSync(out)) return out;
  const empty = mkdtempSync(join(tmpdir(), 'ascend-pdf-'));
  try {
    const script = 'import sys, pypdf\nr = pypdf.PdfReader(sys.argv[1])\nopen(sys.argv[2], "w", encoding="utf-8").write("\\n\\n".join((p.extract_text() or "") for p in r.pages))';
    return run(settings?.python ?? 'python', ['-c', script, file, out], empty).status === 0 && existsSync(out) ? out : null;
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}

// Writes the attachments (and the owner's @diff) into the session folder, never committed; returns what the prompts list.
export function saveAttachments(dir, files, { diff = null, settings } = {}) {
  if (!files.length && !diff) return [];
  excludeFromGit(dir, '.ascend/');
  const folder = join(dir, ATTACH_DIR);
  mkdirSync(folder, { recursive: true });
  const saved = files.map(({ name, kind, bytes }) => {
    writeFileSync(join(folder, name), bytes);
    const text = kind === 'pdf' && pdfText(join(folder, name), settings);
    return { path: `${ATTACH_DIR}/${name}`, kind, ...(kind === 'pdf' ? { text: text ? `${ATTACH_DIR}/${name}.txt` : null } : {}) };
  });
  if (diff) {
    writeFileSync(join(folder, 'owner-changes.diff'), diff, 'utf8');
    saved.push({ path: `${ATTACH_DIR}/owner-changes.diff`, kind: 'diff' });
  }
  return saved;
}

// Parallel and race attempts work in their own worktrees, so they get their own copy.
export function copyAttachments(from, to) {
  if (!existsSync(join(from, ATTACH_DIR))) return;
  excludeFromGit(to, '.ascend/');
  cpSync(join(from, ATTACH_DIR), join(to, ATTACH_DIR), { recursive: true });
}

// The prompt lines for the owner's attachments and the files the task points at; empty when there are none.
export function attachmentLines(attachments = [], fileRefs = []) {
  const what = a => (a.kind === 'image' ? 'image: open it with your file or image tool'
    : a.kind === 'pdf' ? (a.text ? `PDF; its text is in ${a.text}` : 'PDF; its text could not be extracted')
      : a.kind === 'diff' ? "the owner's uncommitted changes in their own checkout" : 'text');
  return [
    attachments.length ? `\nATTACHMENTS from the owner, in the project folder. Read each before you start:\n${attachments.map(a => `- ${a.path} (${what(a)})`).join('\n')}` : '',
    fileRefs.length ? `\nFILES THE OWNER POINTS AT: ${fileRefs.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}
