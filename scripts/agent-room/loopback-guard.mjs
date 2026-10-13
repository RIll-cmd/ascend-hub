// The dev server listens on 0.0.0.0, and the room API drives agents that can run commands.
// Runs in Vite's Node middleware, before workerd, where the real peer address is still known.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function roomLoopbackGuard(req, res, next) {
  const path = (req.url ?? '').split('?')[0];
  if ((path === '/api/room' || path.startsWith('/api/room/')) && !LOOPBACK.has(req.socket?.remoteAddress)) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json');
    res.end('{"error":"ROOM_LOCAL_ONLY"}');
    return;
  }
  next();
}
