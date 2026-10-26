import { join } from 'node:path';
import { readEnvFile } from './mcp-launch.mjs';
import { roomError } from './paths.mjs';

// MCP connectors the owner lists in settings.json under "connectors", for example
//   "github": { "name": "GitHub", "description": "Issues and PRs", "command": "npx.cmd", "args": ["-y", "@modelcontextprotocol/server-github"], "env": ["GITHUB_PERSONAL_ACCESS_TOKEN"] }
// A session picks some of them; Claude and Codex get those servers for every turn. Antigravity reads MCP servers only
// from its own global config, so it keeps whatever `agy mcp` has. Values for "env" come from the room's environment or
// Hub's .env.local and reach only that server, through mcp-launch.mjs.
// shortcut: stdio servers only; add "url" (streamable HTTP) when a connector needs it.
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LAUNCHER = join(import.meta.dirname, 'mcp-launch.mjs');

export function cleanConnectors(value, warn = console.warn) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    warn('settings.json: "connectors" must be an object of MCP servers by id; no connectors.');
    return {};
  }
  const out = {};
  for (const [id, c] of Object.entries(value)) {
    const ok = ID.test(id) && c && typeof c === 'object'
      && typeof c.command === 'string' && c.command.trim() && c.command.length <= 500
      && (c.args === undefined || (Array.isArray(c.args) && c.args.length <= 50 && c.args.every(a => typeof a === 'string' && a.length <= 1000)))
      && (c.env === undefined || (Array.isArray(c.env) && c.env.length <= 20 && c.env.every(n => typeof n === 'string' && ENV_NAME.test(n))))
      && (c.name === undefined || (typeof c.name === 'string' && c.name.length <= 60))
      && (c.description === undefined || (typeof c.description === 'string' && c.description.length <= 200));
    if (!ok) {
      warn(`settings.json: connector "${id}" needs a lowercase id, a "command", and optional "args" (strings), "env" (variable names), "name" and "description"; skipped.`);
      continue;
    }
    out[id] = { id, name: c.name || id, description: c.description ?? '', command: c.command, args: c.args ?? [], env: c.env ?? [] };
  }
  return out;
}

// What the start form shows: each connector and the variables it lists that have no value yet.
export function connectorList(settings, env = process.env) {
  const file = readEnvFile(settings.envFile);
  return Object.values(settings.connectors ?? {}).map(c => ({ id: c.id, name: c.name, description: c.description, missing: c.env.filter(n => env[n] === undefined && file[n] === undefined) }));
}

// A session's pick: ids of connectors in settings.
export function chooseConnectors(value, settings) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20 || !value.every(id => typeof id === 'string' && settings.connectors?.[id])) throw roomError('CONNECTORS_INVALID', 'Pick connectors from the list in room settings.');
  return [...new Set(value)];
}

const launch = (c, envFile) => [LAUNCHER, envFile || '-', c.env.length ? c.env.join(',') : '-', '--', c.command, ...c.args];

// Claude: one --mcp-config JSON and its tools allowed by server (mcp__<id>).
export function claudeMcp(connectors, envFile) {
  if (!connectors.length) return { args: [], allowed: [] };
  const mcpServers = Object.fromEntries(connectors.map(c => [c.id, { command: process.execPath, args: launch(c, envFile) }]));
  return { args: ['--mcp-config', JSON.stringify({ mcpServers })], allowed: connectors.map(c => `mcp__${c.id}`) };
}

// Codex: -c overrides. It starts servers with a trimmed environment, so env_vars passes the listed names through, and
// exec never asks for approval, so the session's servers are approved up front.
export function codexMcp(connectors, envFile) {
  const toml = JSON.stringify;
  return connectors.flatMap(c => [
    '-c', `mcp_servers.${c.id}.command=${toml(process.execPath)}`,
    '-c', `mcp_servers.${c.id}.args=[${launch(c, envFile).map(a => toml(a)).join(',')}]`,
    '-c', `mcp_servers.${c.id}.default_tools_approval_mode="approve"`,
    ...(c.env.length ? ['-c', `mcp_servers.${c.id}.env_vars=[${c.env.map(n => toml(n)).join(',')}]`] : []),
  ]);
}
