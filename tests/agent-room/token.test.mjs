import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureRoomToken } from '../../scripts/agent-room/token.mjs';

const envFile = () => join(mkdtempSync(join(tmpdir(), 'ascend-room-token-')), '.env.local');

test('creates .env.local with a fresh 64-hex token when missing', () => {
  const file = envFile();
  const token = ensureRoomToken(file);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(file, 'utf8'), `ASCEND_ROOM_TOKEN=${token}\n`);
});

test('appends the token without touching existing lines', () => {
  const file = envFile();
  writeFileSync(file, 'A=1\nB=two');
  const token = ensureRoomToken(file);
  assert.equal(readFileSync(file, 'utf8'), `A=1\nB=two\nASCEND_ROOM_TOKEN=${token}\n`);
});

test('reuses an existing token and never rewrites the file', () => {
  const file = envFile();
  writeFileSync(file, 'A=1\r\nASCEND_ROOM_TOKEN=abc123\r\n');
  assert.equal(ensureRoomToken(file), 'abc123');
  assert.equal(readFileSync(file, 'utf8'), 'A=1\r\nASCEND_ROOM_TOKEN=abc123\r\n');
});
