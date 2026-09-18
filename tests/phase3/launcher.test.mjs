import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Codex probe preserves quoted Windows paths as single native arguments', async () => {
  const launcher = await import('../../scripts/phase3-codex-launcher.mjs').catch(() => null);
  assert.ok(launcher, 'The probe needs a shell-free native argument launcher');
  const command = 'node "D:/ascend_hub/scripts/phase3-hook-probe.mjs" --source codex-cli --event Stop --output "C:/Users/Cyrill Gerard/Temp/codex-events.jsonl"';
  const args = launcher.buildCodexProbeArguments({ Stop: [{ hooks: [{ command }] }] });
  const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ...args], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0);
  const received = JSON.parse(result.stdout);
  assert.equal(received.length, 11);
  assert.equal(received[9], '-c');
  assert.equal(received[10], `hooks.Stop=[{hooks = [{type = 'command', command = '${command}', commandWindows = '${command}', timeout = 3}]}]`);
  assert.equal(received.includes('--dangerously-bypass-hook-trust'), false);
});

test('probe launcher rejects unknown hook events and unsafe TOML command delimiters', async () => {
  const { buildCodexProbeArguments } = await import('../../scripts/phase3-codex-launcher.mjs');
  for (const hooks of [
    { Unknown: [{ hooks: [{ command: 'node probe.mjs' }] }] },
    { Stop: [{ hooks: [{ command: "node 'probe.mjs'" }] }] },
    { Stop: [{ hooks: [{ command: 'node probe.mjs\nother-command' }] }] },
    { Stop: [] },
  ]) {
    assert.throws(() => buildCodexProbeArguments(hooks), /Invalid temporary probe hook definition/);
  }
});
