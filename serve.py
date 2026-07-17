#!/usr/bin/env python3
"""Дев-сервер: no-cache + приём POST /save?name=... (для контрольных листов)."""
import http.server, sys, os, re
from urllib.parse import urlparse, parse_qs

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
os.chdir(DOCS)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = re.sub(r"[^\w.\-]", "", (q.get("name") or ["x"])[0])
        n = int(self.headers.get("Content-Length", 0))
        os.makedirs("_sheets", exist_ok=True)
        with open(os.path.join("_sheets", name), "wb") as f:
            f.write(self.rfile.read(n))
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")

http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8643), Handler).serve_forever()
