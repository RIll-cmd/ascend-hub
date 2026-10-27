// A stand-in agent room for Test-RoomHost.ps1: GET /tray answers 200 only with the token in the working folder's
// .env.local, and writes a token there first when it has none, as the real room does.
import { appendFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const file = '.env.local';
const text = readFileSync(file, 'utf8');
let token = /^ASCEND_ROOM_TOKEN=(["']?)([^"'\s]+)\1/m.exec(text)?.[2];
if (!token) { token = randomBytes(16).toString('hex'); appendFileSync(file, `ASCEND_ROOM_TOKEN=${token}\n`); }
createServer((req, res) => {
  const ok = req.headers.authorization === `Bearer ${token}`;
  res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
  res.end(JSON.stringify(ok ? { tvs: [], idle: process.env.ASCEND_ROOM_IDLE_MS } : { error: 'UNAUTHORIZED' }));
}).listen(Number(process.env.ASCEND_ROOM_PORT), '127.0.0.1');
