import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('every Hub page tells the room it is open', () => {
  assert.match(read('app/layout.tsx'), /<ViewerHeartbeat \/>/);
  const beat = read('components/ViewerHeartbeat.tsx');
  assert.match(beat, /"\/api\/viewer"/);
  assert.match(beat, /30_000/);
  assert.match(read('app/api/viewer/route.ts'), /forwardToRoom\("\/viewer", \{ method: "POST" \}\)/);
});

test('the room page takes a draft from the tray remote', () => {
  assert.match(read('app/room/room-parts.tsx'), /\.get\("draft"\)/);
});
