import assert from 'node:assert/strict';
import test from 'node:test';
import { startAgentRoom } from '../../scripts/agent-room/launch.mjs';

test('Hub leaves the room alone when the desktop launcher owns it', () => {
  let spawned = 0;
  const spawnImpl = () => { spawned++; return { unref() {} }; };
  assert.equal(startAgentRoom({ env: { ASCEND_ROOM_EXTERNAL: '1' }, spawnImpl }), false);
  assert.equal(spawned, 0);
  assert.equal(startAgentRoom({ env: {}, spawnImpl }), true);
  assert.equal(spawned, 1);
});
