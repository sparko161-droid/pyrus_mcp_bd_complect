#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборщик-интроспектор MCP-сервера.

Подключается к удалённому MCP по streamable-http, выполняет рукопожатие
и выгружает ПОЛНЫЙ перечень возможностей: инструменты с их JSON Schema,
ресурсы, промпты, серверные capabilities.

Зачем: получить точное описание чужого закрытого сервера, чтобы (а) знать,
что он реально умеет, а не что написано в его документации, и (б) иметь
машиночитаемую спецификацию для собственной реализации.

Запуск:
    export MCP_URL=https://pyrus-mcp-production.up.railway.app/mcp
    export MCP_BEARER=...
    export PYRUS_LOGIN=you@example.com
    export PYRUS_SECURITY_KEY=...
    python3 mcp_introspect.py

Зависимости: httpx  (pip install httpx)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

try:
    import httpx
except ImportError:
    sys.exit("Нужен httpx:  pip install httpx")

PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "mcp-introspect", "version": "1.0.0"}


class McpError(RuntimeError):
    pass


class StreamableHttpClient:
    """
    Минимальный клиент MCP поверх streamable-http.

    Сервер вправе ответить на POST либо обычным JSON, либо потоком SSE —
    спецификация разрешает и то, и другое, поэтому разбираем оба случая.
    Идентификатор сессии, если сервер его выдал, возвращается заголовком
    Mcp-Session-Id при initialize и обязан присутствовать во всех
    последующих запросах.
    """

    def __init__(self, url: str, headers: dict[str, str], timeout: float = 60.0,
                 verbose: bool = False):
        self.url = url
        self.base_headers = dict(headers)
        self.session_id: str | None = None
        self.verbose = verbose
        self._id = 0
        self._client = httpx.Client(timeout=timeout, follow_redirects=True)

    # ---------------------------------------------------------------- низкий уровень

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def _headers(self) -> dict[str, str]:
        h = dict(self.base_headers)
        h["Content-Type"] = "application/json"
        h["Accept"] = "application/json, text/event-stream"
        h["MCP-Protocol-Version"] = PROTOCOL_VERSION
        if self.session_id:
            h["Mcp-Session-Id"] = self.session_id
        return h

    @staticmethod
    def _parse_sse(text: str) -> list[dict[str, Any]]:
        """Вытащить JSON-сообщения из потока SSE."""
        messages: list[dict[str, Any]] = []
        for block in text.replace("\r\n", "\n").split("\n\n"):
            payload_lines = [
                ln[5:].lstrip() for ln in block.split("\n") if ln.startswith("data:")
            ]
            if not payload_lines:
                continue
            raw = "\n".join(payload_lines).strip()
            if not raw or raw == "[DONE]":
                continue
            try:
                messages.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        return messages

    def _post(self, payload: dict[str, Any], expect_reply: bool = True) -> dict[str, Any] | None:
        if self.verbose:
            print(f"  → {payload.get('method')}", file=sys.stderr)

        resp = self._client.post(self.url, headers=self._headers(), json=payload)

        # Сервер мог выдать сессию именно здесь.
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid and not self.session_id:
            self.session_id = sid
            if self.verbose:
                print(f"  · сессия {sid}", file=sys.stderr)

        if resp.status_code == 202:  # принято, ответа не будет (нотификация)
            return None
        if resp.status_code >= 400:
            raise McpError(
                f"HTTP {resp.status_code} на {payload.get('method')}: "
                f"{resp.text[:400]}"
            )
        if not expect_reply:
            return None

        ctype = resp.headers.get("content-type", "")
        if "text/event-stream" in ctype:
            messages = self._parse_sse(resp.text)
        else:
            body = resp.text.strip()
            if not body:
                return None
            parsed = json.loads(body)
            messages = parsed if isinstance(parsed, list) else [parsed]

        want = payload.get("id")
        for msg in messages:
            if msg.get("id") == want:
                if "error" in msg:
                    err = msg["error"]
                    raise McpError(
                        f"{payload.get('method')} → ошибка {err.get('code')}: "
                        f"{err.get('message')}"
                    )
                return msg.get("result", {})
        raise McpError(f"Сервер не вернул ответ на {payload.get('method')}")

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._post({
            "jsonrpc": "2.0", "id": self._next_id(),
            "method": method, "params": params or {},
        }) or {}

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        self._post({"jsonrpc": "2.0", "method": method, "params": params or {}},
                   expect_reply=False)

    # ---------------------------------------------------------------- протокол

    def initialize(self) -> dict[str, Any]:
        result = self.call("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": CLIENT_INFO,
        })
        self.notify("notifications/initialized")
        return result

    def list_all(self, method: str, key: str) -> list[dict[str, Any]]:
        """Постранично собрать список (tools / resources / prompts)."""
        items: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(200):  # предохранитель от бесконечного курсора
            params = {"cursor": cursor} if cursor else {}
            result = self.call(method, params)
            items.extend(result.get(key, []))
            cursor = result.get("nextCursor")
            if not cursor:
                break
        return items

    def close(self) -> None:
        if self.session_id:
            try:
                self._client.delete(self.url, headers=self._headers())
            except Exception:
                pass
        self._client.close()


# ---------------------------------------------------------------- анализ схем


def schema_params(schema: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Разложить inputSchema инструмента в плоский список параметров."""
    if not isinstance(schema, dict):
        return []
    props = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    out = []
    for name, spec in props.items():
        spec = spec if isinstance(spec, dict) else {}
        t = spec.get("type")
        if not t and "anyOf" in spec:
            t = "/".join(
                str(v.get("type", "?")) for v in spec["anyOf"] if isinstance(v, dict)
            )
        if t == "array":
            item_t = (spec.get("items") or {}).get("type", "?")
            t = f"array<{item_t}>"
        out.append({
            "name": name,
            "type": t or "any",
            "required": name in required,
            "enum": spec.get("enum"),
            "default": spec.get("default"),
            "description": (spec.get("description") or "").strip(),
        })
    out.sort(key=lambda p: (not p["required"], p["name"]))
    return out


def collect(client: StreamableHttpClient) -> dict[str, Any]:
    inv: dict[str, Any] = {
        "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "url": client.url,
    }

    print("• рукопожатие…", file=sys.stderr)
    init = client.initialize()
    inv["protocolVersion"] = init.get("protocolVersion")
    inv["serverInfo"] = init.get("serverInfo", {})
    inv["capabilities"] = init.get("capabilities", {})
    inv["instructions"] = init.get("instructions")
    caps = inv["capabilities"]
    print(f"  сервер: {inv['serverInfo'].get('name','?')} "
          f"{inv['serverInfo'].get('version','')}", file=sys.stderr)

    # Инструменты
    tools: list[dict[str, Any]] = []
    if "tools" in caps or True:  # спрашиваем всегда — capabilities врут чаще, чем tools/list
        try:
            print("• tools/list…", file=sys.stderr)
            tools = client.list_all("tools/list", "tools")
            print(f"  {len(tools)} инструментов", file=sys.stderr)
        except McpError as e:
            print(f"  инструменты недоступны: {e}", file=sys.stderr)
    inv["tools"] = [{
        "name": t.get("name"),
        "title": t.get("title"),
        "description": (t.get("description") or "").strip(),
        "params": schema_params(t.get("inputSchema")),
        "inputSchema": t.get("inputSchema"),
        "outputSchema": t.get("outputSchema"),
        "annotations": t.get("annotations"),
    } for t in tools]

    for method, key, label in [
        ("resources/list", "resources", "ресурсов"),
        ("resources/templates/list", "resourceTemplates", "шаблонов ресурсов"),
        ("prompts/list", "prompts", "промптов"),
    ]:
        try:
            print(f"• {method}…", file=sys.stderr)
            items = client.list_all(method, key)
            inv[key] = items
            print(f"  {len(items)} {label}", file=sys.stderr)
        except McpError as e:
            inv[key] = []
            print(f"  нет ({str(e)[:90]})", file=sys.stderr)

    return inv


# ---------------------------------------------------------------- точка входа


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Выгрузить полное описание возможностей MCP-сервера")
    ap.add_argument("--url", default=os.environ.get("MCP_URL"),
                    help="адрес /mcp (или переменная MCP_URL)")
    ap.add_argument("--bearer", default=os.environ.get("MCP_BEARER"),
                    help="токен доступа к серверу (MCP_BEARER)")
    ap.add_argument("--header", action="append", default=[], metavar="K:V",
                    help="дополнительный заголовок, можно несколько раз")
    ap.add_argument("--out", default="inventory.json", help="куда сохранить JSON")
    ap.add_argument("--timeout", type=float, default=60.0)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not args.url:
        return ap.error("не задан --url (или MCP_URL)")

    headers: dict[str, str] = {}
    if args.bearer:
        headers["Authorization"] = f"Bearer {args.bearer}"
    # Реквизиты Pyrus — как их ждёт railway-сервер.
    if os.environ.get("PYRUS_LOGIN"):
        headers["X-Pyrus-Login"] = os.environ["PYRUS_LOGIN"]
    if os.environ.get("PYRUS_SECURITY_KEY"):
        headers["X-Pyrus-Security-Key"] = os.environ["PYRUS_SECURITY_KEY"]
    if os.environ.get("PYRUS_ACCESS_TOKEN"):
        headers["X-Pyrus-Access-Token"] = os.environ["PYRUS_ACCESS_TOKEN"]
    for raw in args.header:
        if ":" not in raw:
            return ap.error(f"заголовок без двоеточия: {raw}")
        k, v = raw.split(":", 1)
        headers[k.strip()] = v.strip()

    client = StreamableHttpClient(args.url, headers, args.timeout, args.verbose)
    try:
        inv = collect(client)
    except McpError as e:
        print(f"\nОШИБКА: {e}", file=sys.stderr)
        return 2
    except httpx.HTTPError as e:
        print(f"\nСЕТЬ: {e}", file=sys.stderr)
        return 3
    finally:
        client.close()

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(inv, f, ensure_ascii=False, indent=2)

    n_write = sum(
        1 for t in inv["tools"]
        if (t.get("annotations") or {}).get("readOnlyHint") is False
    )
    print(f"\nГотово: {args.out}", file=sys.stderr)
    print(f"  инструментов: {len(inv['tools'])}", file=sys.stderr)
    if n_write:
        print(f"  из них помечены как пишущие: {n_write}", file=sys.stderr)
    print(f"  ресурсов: {len(inv.get('resources', []))}, "
          f"промптов: {len(inv.get('prompts', []))}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
