#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Заглушка Pyrus API — только чтобы проверить связку apiscope + probe_tools,
не трогая настоящий Pyrus. Отвечает правдоподобным JSON на нужные пути.

Запуск: python3 fake_pyrus.py --port 8091
"""

import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROUTES = [
    (r"^/v4/tasks/(\d+)$", "GET", lambda m: {
        "task": {"id": int(m.group(1)), "text": "Тестовая задача",
                 "comments": [{"id": 1, "text": "первый"}],
                 "attachments": [{"id": 449339042, "root_id": 449339042,
                                  "name": "Чек.jpg"}]}}),
    (r"^/v4/forms$", "GET", lambda m: {
        "forms": [{"id": 1504224, "name": "Заявка на оплату"}]}),
    (r"^/v4/forms/(\d+)$", "GET", lambda m: {
        "id": int(m.group(1)), "name": "Заявка на оплату",
        "fields": [{"id": 6, "name": "Контрагент", "type": "catalog"},
                   {"id": 16, "name": "Скан", "type": "file"}]}),
    (r"^/v4/forms/(\d+)/register$", "GET", lambda m: {
        "tasks": [{"id": 1, "current_step": 2}, {"id": 2, "current_step": 5}]}),
    (r"^/v4/catalogs/(\d+)$", "GET", lambda m: {
        "catalog_id": int(m.group(1)), "items": [{"item_id": 1, "values": ["ООО Ромашка"]}]}),
    (r"^/v4/knowledgebase/structure$", "GET", lambda m: {
        "topics": [{"id": 10, "title": "Регламенты", "children": []}]}),
    (r"^/v4/profile$", "GET", lambda m: {
        "person_id": 777, "email": "you@example.com", "organization_id": 42}),
    (r"^/v4/lists$", "GET", lambda m: {"lists": [{"id": 42, "name": "В работе"}]}),
    (r"^/v4/files/download/(\d+)$", "GET", lambda m: {
        "url": f"https://files.pyrus.com/{m.group(1)}", "name": "Чек.jpg"}),
    (r"^/v4/tasks/(\d+)/comments$", "POST", lambda m: {
        "task": {"id": int(m.group(1)), "comments": [{"id": 2, "text": "добавлено"}]}}),
    (r"^/v4/auth$", "POST", lambda m: {"access_token": "fake-token-abc"}),
]


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _handle(self):
        path = self.path.split("?")[0]
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            self.rfile.read(n)
        for pattern, verb, fn in ROUTES:
            m = re.match(pattern, path)
            if m and verb == self.command:
                body = json.dumps(fn(m), ensure_ascii=False).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        body = json.dumps({"error_code": "not_found", "path": path}).encode()
        self.send_response(404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = do_POST = do_PUT = do_DELETE = _handle


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8091)
    a = ap.parse_args()
    print(f"фейковый Pyrus слушает :{a.port}")
    ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()
