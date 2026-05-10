from __future__ import annotations

import argparse
import base64
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProtectedHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
      super().__init__(*args, directory=directory, **kwargs)

    def _authorized(self) -> bool:
        username = os.environ.get("MLS_DASHBOARD_USER", "")
        password = os.environ.get("MLS_DASHBOARD_PASSWORD", "")
        if not username or not password:
            return True

        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False

        try:
            decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        except Exception:
            return False

        return decoded == f"{username}:{password}"

    def _request_auth(self) -> None:
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="MLS Users Dashboard", charset="UTF-8"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Authentication required.\n")

    def do_GET(self):
        if not self._authorized():
            self._request_auth()
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._authorized():
            self._request_auth()
            return
        super().do_HEAD()

    def log_message(self, format, *args):
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve MLS Users with optional Basic Auth")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    args = parser.parse_args()

    handler = partial(ProtectedHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {ROOT} on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
