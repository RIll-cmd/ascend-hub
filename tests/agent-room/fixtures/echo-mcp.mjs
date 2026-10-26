// A dependency-free stdio MCP server for tests and live checks. Its one tool, echo_word, reports ROOM_ECHO_WORD and
// whether ROOM_LEAK_TEST reached it (it never should through mcp-launch).
import { createInterface } from 'node:readline';

const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const tool = { name: 'echo_word', description: 'Returns the room echo word.', inputSchema: { type: 'object', properties: {} } };

createInterface({ input: process.stdin }).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') {
    return send({ id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'echo', version: '1.0.0' } } });
  }
  if (msg.method === 'tools/list') return send({ id: msg.id, result: { tools: [tool] } });
  if (msg.method === 'tools/call') {
    const text = `word=${process.env.ROOM_ECHO_WORD ?? 'missing'} leaked=${process.env.ROOM_LEAK_TEST ? 'yes' : 'no'}`;
    return send({ id: msg.id, result: { content: [{ type: 'text', text }] } });
  }
  send({ id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } });
});
