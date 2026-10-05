"""Local fixture for the Windows desktop supervisor acceptance test."""
import argparse
import json
import os
import time
import threading
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--component', choices=('hub', 'vision'), required=True)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--mode', choices=('ready', 'hang', 'exit', 'wrong-id', 'stop-ignore', 'stop-late', 'stop-delay', 'descendant', 'ready-exit', 'health-fails', 'descendant-exit'), default='ready')
    args = parser.parse_args()
    if args.mode == 'exit':
        return 4
    if args.mode == 'hang':
        print('private fixture message should never be logged', flush=True)
        while True:
            time.sleep(1)

    if args.mode in ('descendant', 'descendant-exit'):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(180)'])
        print('ASCEND_FIXTURE_CHILD=' + str(child.pid), flush=True)
    if args.mode == 'descendant-exit':
        time.sleep(.3)
        return 0
    started_at = time.monotonic()
    if args.mode == 'ready-exit':
        threading.Thread(target=lambda: (time.sleep(4), os._exit(0)), daemon=True).start()
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != '/api/fairy/shutdown' or self.headers.get('Authorization') != 'Bearer ' + os.environ['ASCEND_LAUNCH_TOKEN']:
                self.send_error(403)
                return
            if args.mode == 'stop-ignore' or args.mode == 'descendant':
                self.send_error(503)
                return
            delay = 18 if args.mode == 'stop-late' else 2
            threading.Thread(target=lambda: (time.sleep(delay), os._exit(0)), daemon=True).start()
            self.send_response(200)
            self.end_headers()
        def do_GET(self):
            expected = '/api/health' if args.component == 'hub' else '/api/fairy/health'
            if self.path != expected:
                self.send_error(404)
                return
            if self.headers.get('Authorization') != 'Bearer ' + os.environ['ASCEND_LAUNCH_TOKEN']:
                self.send_error(403)
                return
            body = json.dumps({
                'schemaVersion': 1,
                'component': args.component,
                'instanceId': 'wrong' if args.mode == 'wrong-id' else os.environ['ASCEND_INSTANCE_ID'],
                'buildId': os.environ['ASCEND_BUILD_ID'],
                'state': 'failed' if args.mode == 'health-fails' and time.monotonic() - started_at > 3 else 'ready',
                'capabilities': {'ui': 'ready', 'chat': 'ready'},
            }).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    if args.component == 'vision':
        print('ASCEND_FAIRY_URL=http://127.0.0.1:%s/?runtime=1' % args.port, flush=True)
    server.serve_forever()


if __name__ == '__main__':
    raise SystemExit(main())
