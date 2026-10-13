import assert from 'node:assert/strict';
import test from 'node:test';
import { roomLoopbackGuard } from '../../scripts/agent-room/loopback-guard.mjs';

function run(url, remoteAddress) {
  const res = { statusCode: 200, ended: false, setHeader() {}, end() { this.ended = true; } };
  let nextCalled = false;
  roomLoopbackGuard({ url, socket: { remoteAddress } }, res, () => { nextCalled = true; });
  return { status: res.statusCode, nextCalled, ended: res.ended };
}

test('room API is refused to non-loopback peers', () => {
  for (const peer of ['192.168.56.1', '10.0.0.5', '::ffff:192.168.1.3', undefined]) {
    assert.deepEqual(run('/api/room/sessions', peer), { status: 403, nextCalled: false, ended: true }, String(peer));
  }
  assert.equal(run('/api/room', '172.16.0.2').status, 403);
});

test('room API is allowed from this machine, other routes are untouched', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(run('/api/room/sessions/current', peer).nextCalled, true, peer);
  }
  assert.equal(run('/api/weather', '192.168.1.3').nextCalled, true);
  assert.equal(run('/roomy', '192.168.1.3').nextCalled, true);
});
