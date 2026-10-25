import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

// Hub route handlers run in workerd and only see .env.local through process.env,
// so the room token lives there, shared by both sides.
export function ensureRoomToken(envFile) {
  const text = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  // Quotes around the value are not part of it, as Hub's env loader reads it too.
  const found = /^ASCEND_ROOM_TOKEN=(["']?)([^"'\s]+)\1\s*$/m.exec(text);
  if (found) return found[2];
  const token = randomBytes(32).toString('hex');
  appendFileSync(envFile, `${text && !text.endsWith('\n') ? '\n' : ''}ASCEND_ROOM_TOKEN=${token}\n`, { encoding: 'utf8', mode: 0o600 });
  return token;
}
