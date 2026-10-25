import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A plain-text scan of a fetched skill for instructions aimed at the agents rather than the task: attempts to override
// the room's rules, to hide things from the owner, to read secrets, to download and run code, or text hidden with
// invisible characters. It only warns on the staged card: a clean scan does not prove a skill safe.
const RULES = [
  ['override', 'tells the agent to ignore earlier or other instructions',
    /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|any|other|system|room)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?)\b/i],
  ['identity', 'tries to replace the agent\'s instructions', /\byou are now\b|\bnew system (prompt|instructions)\b|\byour (real|true|new) (task|instructions)\b/i],
  ['secrecy', 'tells the agent to hide something from the owner',
    /\b(do not|don't|never)\b.{0,30}\b(tell|inform|mention|reveal|show|report)\b.{0,30}\b(the )?(user|owner|human|anyone|reviewer)\b/i],
  ['secrets', 'reads or sends secret files',
    /\b(cat|type|get-content|read|open|upload|send|post|copy)\b.{0,50}(\.env\b|id_rsa|id_ed25519|\.ssh[\\/]|credentials\.json|\.credentials|auth\.json|\.npmrc|\.git-credentials)/i],
  ['download-run', 'downloads code and runs it', /\b(curl|wget|irm|iwr|invoke-webrequest|invoke-restmethod)\b[^\n]{0,160}\|\s*(sh|bash|zsh|iex|invoke-expression|powershell|pwsh|node|python)\b/i],
  ['eval', 'evaluates a downloaded or built string as code', /\b(invoke-expression|iex)\s*[(\s]/i],
  ['git-force', 'force-pushes or throws away commits', /\bgit\s+push\b[^\n]*(--force|\s-f\b)|\bgit\s+reset\s+--hard\b/i],
  ['hidden-text', 'contains invisible characters that can hide text', /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/],
  ['encoded', 'contains a long encoded blob', /[A-Za-z0-9+/]{240,}={0,2}/],
];
const MAX_FINDINGS = 30;
const MAX_SCAN_BYTES = 2_000_000;

export function scanText(file, text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [rule, why, pattern] of RULES) {
      // A byte-order mark at the very start of a file is ordinary, not hidden text.
      const checked = rule === 'hidden-text' && i === 0 ? line.replace(/^﻿/, '') : line;
      if (pattern.test(checked)) findings.push({ file, line: i + 1, rule, why, text: line.replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '⟨?⟩').trim().slice(0, 160) });
    }
  });
  return findings;
}

// Every text file of a staged skill (binary and very large files are skipped), at most MAX_FINDINGS findings.
export function scanSkill(dir, files) {
  const findings = [];
  for (const rel of files) {
    try {
      if (statSync(join(dir, rel)).size > MAX_SCAN_BYTES) continue;
      const buf = readFileSync(join(dir, rel));
      if (buf.includes(0)) continue;
      findings.push(...scanText(rel, buf.toString('utf8')));
    } catch { /* unreadable: nothing to scan */ }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings.slice(0, MAX_FINDINGS);
}
