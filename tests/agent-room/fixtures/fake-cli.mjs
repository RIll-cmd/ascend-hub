// Stands in for codex/claude/agy: prompt from --print=<p> or stdin; behavior keyed by prompt text.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const printArg = args.find(a => a.startsWith('--print='));
const outIndex = args.indexOf('-o');
const chunks = [];
if (!printArg) for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = printArg ? printArg.slice('--print='.length) : Buffer.concat(chunks).toString('utf8');

// Leaves a grandchild holding our stdout, like an agent that starts a dev server and exits.
if (prompt.includes('LINGER')) spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: 'inherit', detached: true }).unref();
if (prompt.includes('SLEEP')) await new Promise(resolve => setTimeout(resolve, 30_000));
if (prompt.includes('FAIL')) { process.stderr.write('boom'); process.exit(3); }
if (prompt.includes('EMPTY')) process.exit(0);
const reply = `ECHO:${prompt}|ARGS:${JSON.stringify(args)}`;
if (outIndex >= 0) {
  process.stdout.write('noise that is not the final message');
  writeFileSync(args[outIndex + 1], reply);
} else {
  process.stdout.write(reply);
}
