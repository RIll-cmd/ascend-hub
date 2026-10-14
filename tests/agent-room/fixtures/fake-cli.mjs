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
// Mimic the JSON streams: Claude's stream-json (reply in the result event) and Codex's --json (reply still in -o).
const line = value => process.stdout.write(`${JSON.stringify(value)}\n`);
if (args.includes('stream-json')) {
  process.stdout.write('not json, ignored\n');
  if (prompt.includes('SUBAGENT')) {
    line({ type: 'system', subtype: 'task_started', task_id: 't1', description: 'Look around', subagent_type: 'Explore' });
    line({ type: 'system', subtype: 'task_progress', task_id: 't1', description: 'Reading a.txt', last_tool_name: 'Read' });
    line({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'completed' } });
  }
  line({ type: 'result', subtype: 'success', result: `final: ${prompt}` });
  process.exit(0);
}
if (args.includes('--json') && prompt.includes('SUBAGENT')) {
  line({ type: 'item.started', item: { type: 'collab_tool_call', tool: 'wait' } });
  line({ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'wait' } });
}
if (outIndex >= 0) {
  process.stdout.write('noise that is not the final message');
  writeFileSync(args[outIndex + 1], reply);
} else {
  process.stdout.write(reply);
}
