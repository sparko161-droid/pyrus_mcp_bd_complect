#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apiscope — логирующий прокси между чужим MCP-сервером и Pyrus API.

Зачем. `tools/list` отдаёт описание инструментов, но не говорит, какие
HTTP-вызовы к Pyrus за ними стоят. Именно там и живёт эмпирика: недокументированные
эндпоинты, хитрые параметры, порядок вызовов. Достать это можно, не имея
исходников, — потому что railway-сервер принимает параметр `api_url` в каждом
инструменте. Наведите `api_url` на этот прокси, и он покажет каждый запрос,
который сервер делает от вашего имени.

Это ваш собственный трафик под вашими же реквизитами Pyrus. Ничего чужого не
вскрывается: сервер по вашей команде ходит в указанный вами адрес.

Запуск локально:
    python3 apiscope.py --port 8099 --log scope.jsonl

Сервер живёт в облаке и до localhost не достучится — нужен публичный адрес:
    cloudflared tunnel --url http://localhost:8099
    ngrok http 8099
Полученный https-адрес и передавайте как api_url (с суффиксом /v4):
    api_url = https://ваш-туннель.trycloudflare.com/v4
Путь пересылается как есть, поэтому --upstream указывайте БЕЗ /v4.

Просмотр накопленного:
    python3 apiscope.py --show scope.jsonl
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import time
from collections import Counter

try:
    import httpx
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import Response
    from starlette.routing import Route
except ImportError:
    sys.exit("Нужны httpx и starlette:  pip install httpx starlette uvicorn")

# Путь приходит от клиента целиком, вместе с /v4 — поэтому в upstream
# префикса /v4 быть не должно, иначе получится /v4/v4/...
UPSTREAM = os.environ.get("SCOPE_UPSTREAM", "https://api.pyrus.com")
LOG_PATH = os.environ.get("SCOPE_LOG", "scope.jsonl")
MAX_BODY = int(os.environ.get("SCOPE_MAX_BODY", "4000"))

# Заголовки, которые нельзя писать в лог целиком.
SECRET_HEADERS = {"authorization", "x-pyrus-security-key", "x-pyrus-access-token",
                  "cookie", "set-cookie"}
# Поля тела, которые нельзя писать в лог целиком.
SECRET_FIELDS = {"security_key", "access_token", "password", "token"}

client: httpx.AsyncClient | None = None
counter = 0


def mask(v: str) -> str:
    v = str(v)
    return f"<{len(v)} симв., …{v[-4:]}>" if len(v) > 8 else "<скрыто>"


def clean_headers(h) -> dict:
    return {k: (mask(v) if k.lower() in SECRET_HEADERS else v)
            for k, v in h.items()
            if k.lower() not in ("host", "content-length", "connection")}


def clean_body(raw: bytes) -> object:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        txt = raw[:MAX_BODY].decode("utf-8", "replace")
        return {"__raw__": txt, "__bytes__": len(raw)}

    def walk(x):
        if isinstance(x, dict):
            return {k: (mask(v) if k.lower() in SECRET_FIELDS else walk(v))
                    for k, v in x.items()}
        if isinstance(x, list):
            return [walk(i) for i in x[:50]]
        if isinstance(x, str) and len(x) > MAX_BODY:
            return x[:MAX_BODY] + f"…(обрезано, всего {len(x)})"
        return x

    return walk(data)


def shape(x, depth: int = 0) -> object:
    """Схема ответа вместо содержимого: что за поля и каких типов."""
    if depth > 4:
        return "…"
    if isinstance(x, dict):
        return {k: shape(v, depth + 1) for k, v in list(x.items())[:40]}
    if isinstance(x, list):
        return [shape(x[0], depth + 1), f"…×{len(x)}"] if x else []
    return type(x).__name__


async def proxy(request: Request) -> Response:
    global counter
    counter += 1
    seq = counter

    path = request.url.path
    base = UPSTREAM.rstrip("/")
    # Подстраховка: если кто-то всё же указал upstream с /v4, а путь тоже
    # начинается с /v4 — не удваиваем.
    if base.endswith("/v4") and path.startswith("/v4/"):
        base = base[:-3]
    target = base + path
    body = await request.body()
    t0 = time.time()

    fwd = {k: v for k, v in request.headers.items()
           if k.lower() not in ("host", "content-length")}
    try:
        assert client is not None
        up = await client.request(request.method, target, content=body or None,
                                  headers=fwd, params=dict(request.query_params))
        status, out, err = up.status_code, up.content, None
        out_headers = {k: v for k, v in up.headers.items()
                       if k.lower() in ("content-type", "x-ratelimit-remaining")}
    except Exception as e:
        status, out, err = 502, json.dumps(
            {"error": "scope upstream failed", "detail": str(e)}).encode(), str(e)
        out_headers = {"content-type": "application/json"}

    dt = round((time.time() - t0) * 1000)

    try:
        parsed = json.loads(out) if out else None
    except Exception:
        parsed = None

    record = {
        "seq": seq,
        "ts": time.time(),
        "method": request.method,
        "path": path,
        "query": dict(request.query_params),
        "req_headers": clean_headers(request.headers),
        "req_body": clean_body(body),
        "status": status,
        "ms": dt,
        "resp_bytes": len(out),
        "resp_shape": shape(parsed) if parsed is not None else None,
        "error": err,
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"[{seq:>4}] {request.method:6} {path:<44} → {status} "
          f"{dt:>5}ms {len(out):>8}b", file=sys.stderr, flush=True)

    return Response(content=out, status_code=status, headers=out_headers)


@contextlib.asynccontextmanager
async def lifespan(_app):
    global client
    client = httpx.AsyncClient(timeout=120.0, follow_redirects=False)
    print(f"apiscope → {UPSTREAM}\nлог: {LOG_PATH}", file=sys.stderr)
    try:
        yield
    finally:
        await client.aclose()


app = Starlette(
    routes=[Route("/{path:path}", proxy,
                  methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])],
    lifespan=lifespan,
)


def show(path: str) -> int:
    if not os.path.exists(path):
        print(f"нет файла {path}", file=sys.stderr)
        return 1
    rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
    if not rows:
        print("лог пуст")
        return 0

    print(f"Запросов: {len(rows)}\n")
    combos = Counter(f"{r['method']} {r['path']}" for r in rows)
    print("Эндпоинты по частоте:\n")
    print(f"{'вызовов':>8}  {'ср. мс':>7}  {'ср. байт':>9}  эндпоинт")
    for combo, n in combos.most_common():
        sub = [r for r in rows if f"{r['method']} {r['path']}" == combo]
        avg_ms = sum(r["ms"] for r in sub) // len(sub)
        avg_b = sum(r["resp_bytes"] for r in sub) // len(sub)
        codes = sorted({r["status"] for r in sub})
        flag = "" if codes == [200] else f"  [коды: {codes}]"
        print(f"{n:>8}  {avg_ms:>7}  {avg_b:>9}  {combo}{flag}")

    params = Counter()
    for r in rows:
        for k in (r.get("query") or {}):
            params[f"{r['path']} ?{k}"] += 1
        b = r.get("req_body")
        if isinstance(b, dict):
            for k in b:
                if not k.startswith("__"):
                    params[f"{r['path']} .{k}"] += 1
    if params:
        print("\nПараметры, которые сервер реально отправляет:\n")
        for k, n in params.most_common(40):
            print(f"  {n:>4}×  {k}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Логирующий прокси перед Pyrus API")
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--upstream", default=UPSTREAM)
    ap.add_argument("--log", default=LOG_PATH)
    ap.add_argument("--show", metavar="FILE", help="показать сводку по логу и выйти")
    a = ap.parse_args()

    if a.show:
        raise SystemExit(show(a.show))

    UPSTREAM, LOG_PATH = a.upstream, a.log
    import uvicorn
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
