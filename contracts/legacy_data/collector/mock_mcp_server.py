#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Фейковый MCP-сервер поверх streamable-http — только для проверки сборщика.

Умеет нарочно вредничать, чтобы сборщик проверялся на реальных углах:
  --sse         отвечать потоком SSE вместо обычного JSON
  --paginate N  отдавать инструменты страницами по N штук через nextCursor
  --session     требовать Mcp-Session-Id во всех запросах после initialize
  --no-prompts  отвечать ошибкой на prompts/list

Запуск:  python3 mock_mcp_server.py --port 8765 --sse --paginate 3 --session
"""

import argparse
import json
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOLS = [
    {
        "name": "get_task",
        "description": "Задача целиком, вместе с комментариями и вложениями.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "Идентификатор задачи"},
                "include": {"type": "array", "items": {"type": "string"},
                            "description": "Какие части вернуть"},
                "access_token": {"type": "string", "description": "Токен чужого контура"},
                "api_url": {"type": "string", "description": "Контур клиента"},
            },
            "required": ["task_id"],
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "comment_task",
        "description": "Комментарий, смена полей, согласующие, вложения, внешний канал.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "text": {"type": "string"},
                "approval_choice": {"type": "string",
                                    "enum": ["approved", "rejected", "acknowledged"]},
                "field_updates": {"type": "array", "items": {"type": "object"}},
                "channel": {"anyOf": [{"type": "string"}, {"type": "object"}]},
                "skip_notification": {"type": "boolean", "default": False},
            },
            "required": ["task_id"],
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False},
    },
    {
        "name": "sync_catalog",
        "description": "Полная синхронизация справочника.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "catalog_id": {"type": "integer"},
                "items": {"type": "array", "items": {"type": "object"}},
                "apply": {"type": "boolean", "default": False},
            },
            "required": ["catalog_id", "items"],
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "delete_task",
        "description": "Удалить задачу навсегда.",
        "inputSchema": {"type": "object",
                        "properties": {"task_id": {"type": "integer"}},
                        "required": ["task_id"]},
        "annotations": {"readOnlyHint": False, "destructiveHint": True},
    },
    {
        "name": "get_registry",
        "description": "Реестр задач по форме.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "form_id": {"type": "integer"},
                "include_archived": {"type": "boolean", "default": False},
                "field_filters": {"type": "object"},
                "field_ids": {"type": "array", "items": {"type": "integer"}},
                "steps": {"type": "array", "items": {"type": "integer"}},
                "item_count": {"type": "integer"},
            },
            "required": ["form_id"],
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "get_knowledge_base_structure",
        "description": "Иерархия базы знаний.",
        "inputSchema": {"type": "object",
                        "properties": {"depth": {"type": "integer", "default": 3}}},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "get_tasks",
        "description": "Несколько задач за один вызов.",
        "inputSchema": {"type": "object",
                        "properties": {"task_ids": {"type": "array",
                                                    "items": {"type": "integer"}}},
                        "required": ["task_ids"]},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "get_upload_target",
        "description": "Адрес и токен для прямой загрузки файла в Pyrus.",
        "inputSchema": {"type": "object",
                        "properties": {"name": {"type": "string"}}},
        "annotations": {"readOnlyHint": True},
    },
]

# Что каждый инструмент делает наружу. get_upload_target нарочно не ходит
# никуда — так проверяется случай «инструмент без сетевых вызовов».
OUTBOUND = {
    "get_task":        lambda a: [("GET", f"/tasks/{a.get('task_id')}", None)],
    "get_tasks":       lambda a: [("GET", f"/tasks/{i}", None) for i in a.get("task_ids", [])],
    "get_registry":    lambda a: [("GET", f"/forms/{a.get('form_id')}/register"
                                   f"?include_archived={str(a.get('include_archived', False)).lower()}",
                                   None)],
    "get_knowledge_base_structure": lambda a: [("GET", "/knowledgebase/structure", None)],
    "comment_task":    lambda a: [("POST", f"/tasks/{a.get('task_id')}/comments",
                                   {"text": a.get("text", "")})],
    "sync_catalog":    lambda a: [("POST", f"/catalogs/{a.get('catalog_id')}", {"items": []})],
    "delete_task":     lambda a: [("DELETE", f"/tasks/{a.get('task_id')}", None)],
    "get_upload_target": lambda a: [],
}


def go(api_url, method, path, body):
    url = api_url.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer fake-token-abc"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read()[:400].decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


CFG = {"sse": False, "paginate": 0, "session": False, "no_prompts": False}
SESSIONS: set[str] = set()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # тише в консоли
        pass

    # ------------------------------------------------------------------ helpers

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _reply(self, msg: dict, extra: dict | None = None):
        if CFG["sse"]:
            body = f"event: message\ndata: {json.dumps(msg, ensure_ascii=False)}\n\n"
            self._send(200, body.encode(), "text/event-stream", extra)
        else:
            self._send(200, json.dumps(msg, ensure_ascii=False).encode(),
                       "application/json", extra)

    def _error(self, rid, code, message):
        self._reply({"jsonrpc": "2.0", "id": rid,
                     "error": {"code": code, "message": message}})

    # ------------------------------------------------------------------ routes

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self._send(200, b"ok", "text/plain")
        else:
            self._send(405, b"", "text/plain")

    def do_DELETE(self):
        SESSIONS.discard(self.headers.get("Mcp-Session-Id", ""))
        self._send(204, b"", "text/plain")

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            req = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return self._error(None, -32700, "parse error")

        method, rid = req.get("method"), req.get("id")

        if not (self.headers.get("Authorization") or "").startswith("Bearer "):
            return self._send(401, b'{"error":"unauthorized"}', "application/json")

        # Нотификации: 202 без тела.
        if rid is None:
            return self._send(202, b"", "text/plain")

        if method == "initialize":
            extra = {}
            if CFG["session"]:
                sid = uuid.uuid4().hex
                SESSIONS.add(sid)
                extra["Mcp-Session-Id"] = sid
            return self._reply({
                "jsonrpc": "2.0", "id": rid,
                "result": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "mock-pyrus-mcp", "version": "0.0.1"},
                    "instructions": "Тестовая заглушка для проверки сборщика.",
                },
            }, extra)

        if CFG["session"]:
            sid = self.headers.get("Mcp-Session-Id")
            if sid not in SESSIONS:
                return self._send(404, b'{"error":"no session"}', "application/json")

        if method == "tools/list":
            cursor = (req.get("params") or {}).get("cursor")
            step = CFG["paginate"]
            if not step:
                return self._reply({"jsonrpc": "2.0", "id": rid,
                                    "result": {"tools": TOOLS}})
            start = int(cursor) if cursor else 0
            page = TOOLS[start:start + step]
            result = {"tools": page}
            if start + step < len(TOOLS):
                result["nextCursor"] = str(start + step)
            return self._reply({"jsonrpc": "2.0", "id": rid, "result": result})

        if method == "tools/call":
            p = req.get("params") or {}
            tname, targs = p.get("name"), (p.get("arguments") or {})
            if tname not in {t["name"] for t in TOOLS}:
                return self._error(rid, -32602, f"нет инструмента {tname}")
            api_url = targs.get("api_url") or "http://127.0.0.1:8091/v4"
            out = []
            for verb, path, body in OUTBOUND.get(tname, lambda a: [])(targs):
                code, snippet = go(api_url, verb, path, body)
                out.append({"call": f"{verb} {path}", "status": code})
            return self._reply({"jsonrpc": "2.0", "id": rid, "result": {
                "content": [{"type": "text", "text": json.dumps(
                    {"tool": tname, "upstream": out}, ensure_ascii=False)}]}})

        if method == "resources/list":
            return self._reply({"jsonrpc": "2.0", "id": rid, "result": {"resources": []}})

        if method == "resources/templates/list":
            return self._error(rid, -32601, "method not found")

        if method == "prompts/list":
            if CFG["no_prompts"]:
                return self._error(rid, -32601, "prompts not supported")
            return self._reply({"jsonrpc": "2.0", "id": rid, "result": {"prompts": []}})

        return self._error(rid, -32601, f"method not found: {method}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--sse", action="store_true")
    ap.add_argument("--paginate", type=int, default=0)
    ap.add_argument("--session", action="store_true")
    ap.add_argument("--no-prompts", action="store_true")
    a = ap.parse_args()
    CFG.update(sse=a.sse, paginate=a.paginate, session=a.session,
               no_prompts=a.no_prompts)
    print(f"мок слушает :{a.port}  sse={a.sse} paginate={a.paginate} "
          f"session={a.session}")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
