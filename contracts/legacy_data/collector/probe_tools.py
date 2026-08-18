#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
probe_tools — вызывает инструменты чужого MCP по одному и смотрит, какие
запросы к Pyrus за каждым из них стоят.

Работает в паре с apiscope.py. Схема такая:

    probe_tools ──tools/call(api_url=прокси)──▶ чужой MCP ──▶ apiscope ──▶ Pyrus
                                                                  │
                                                              scope.jsonl
                                                                  │
    probe_tools читает лог до и после каждого вызова ◀────────────┘

На выходе — MAPPING.md: таблица «инструмент → эндпоинты Pyrus, сколько
запросов, какие параметры отправлялись». Это то, чего нет ни в tools/list, ни
в документации.

По умолчанию трогает только инструменты, помеченные readOnlyHint: true.
Пишущие — исключительно с флагом --write и только на тестовом контуре.

Пример:
    python3 probe_tools.py \\
        --url https://pyrus-mcp-production.up.railway.app/mcp \\
        --bearer $MCP_BEARER \\
        --api-url https://ваш-туннель.trycloudflare.com/v4 \\
        --log scope.jsonl \\
        --fixtures fixtures.json \\
        --inventory inventory.json

fixtures.json — значения обязательных параметров из ВАШЕГО тестового Pyrus:
    {
      "task_id": 372965117,
      "form_id": 1504224,
      "catalog_id": 100500,
      "list_id": 42,
      "member_id": 777,
      "file_id": 449339042,
      "id": 372965117
    }
Чего нет в fixtures — тот инструмент пропускается с пометкой почему.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter

try:
    import httpx
except ImportError:
    sys.exit("Нужен httpx:  pip install httpx")

PROTOCOL_VERSION = "2025-06-18"

# Инструменты, которые не трогаем никогда, даже если помечены read-only:
# они меняют состояние вопреки аннотации либо шлют наружу.
NEVER = {"delete_task", "delete_list", "delete_knowledge_base_entity",
         "block_member", "delete_member", "delete_role", "sync_catalog"}


def count_lines(path: str) -> int:
    if not os.path.exists(path):
        return 0
    with open(path, "rb") as f:
        return sum(1 for _ in f)


def read_slice(path: str, start: int, end: int) -> list[dict]:
    out = []
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if start <= i < end and line.strip():
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


class Mcp:
    def __init__(self, url: str, headers: dict, timeout: float):
        self.url, self.headers = url, dict(headers)
        self.session: str | None = None
        self._id = 0
        self.c = httpx.Client(timeout=timeout, follow_redirects=True)

    def _h(self):
        h = dict(self.headers)
        h["Content-Type"] = "application/json"
        h["Accept"] = "application/json, text/event-stream"
        h["MCP-Protocol-Version"] = PROTOCOL_VERSION
        if self.session:
            h["Mcp-Session-Id"] = self.session
        return h

    def _messages(self, resp) -> list[dict]:
        if "text/event-stream" in resp.headers.get("content-type", ""):
            msgs = []
            for block in resp.text.replace("\r\n", "\n").split("\n\n"):
                data = "\n".join(l[5:].lstrip() for l in block.split("\n")
                                 if l.startswith("data:")).strip()
                if data and data != "[DONE]":
                    try:
                        msgs.append(json.loads(data))
                    except json.JSONDecodeError:
                        pass
            return msgs
        body = resp.text.strip()
        if not body:
            return []
        p = json.loads(body)
        return p if isinstance(p, list) else [p]

    def rpc(self, method: str, params: dict | None = None, notify: bool = False):
        payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        if not notify:
            self._id += 1
            payload["id"] = self._id
        r = self.c.post(self.url, headers=self._h(), json=payload)
        sid = r.headers.get("mcp-session-id")
        if sid and not self.session:
            self.session = sid
        if notify or r.status_code == 202:
            return None
        r.raise_for_status()
        for m in self._messages(r):
            if m.get("id") == payload.get("id"):
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})
        return None

    def initialize(self):
        res = self.rpc("initialize", {"protocolVersion": PROTOCOL_VERSION,
                                      "capabilities": {},
                                      "clientInfo": {"name": "probe-tools",
                                                     "version": "1.0.0"}})
        self.rpc("notifications/initialized", notify=True)
        return res


def build_args(tool: dict, fixtures: dict) -> tuple[dict | None, str]:
    """Собрать минимальный набор аргументов. Вернуть (args, причина пропуска)."""
    args, missing = {}, []
    for p in tool.get("params") or []:
        if not p.get("required"):
            continue
        name = p["name"]
        if name in ("access_token", "api_url"):
            continue
        if name in fixtures:
            args[name] = fixtures[name]
        elif p.get("enum"):
            args[name] = p["enum"][0]
        elif p.get("type", "").startswith("array"):
            args[name] = []
        elif p.get("type") == "boolean":
            args[name] = False
        else:
            missing.append(f"{name}:{p.get('type')}")
    if missing:
        return None, "нет значений в fixtures: " + ", ".join(missing)
    return args, ""


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Сопоставить инструменты MCP с эндпоинтами Pyrus через apiscope")
    ap.add_argument("--url", required=True, help="адрес /mcp чужого сервера")
    ap.add_argument("--bearer", default=os.environ.get("MCP_BEARER"))
    ap.add_argument("--api-url", required=True,
                    help="публичный адрес apiscope с суффиксом /v4")
    ap.add_argument("--log", default="scope.jsonl", help="файл лога apiscope")
    ap.add_argument("--inventory", default="inventory.json")
    ap.add_argument("--fixtures", default="fixtures.json")
    ap.add_argument("--out", default="MAPPING.md")
    ap.add_argument("--only", help="через запятую: прогнать только эти инструменты")
    ap.add_argument("--write", action="store_true",
                    help="включить и пишущие инструменты (ТОЛЬКО тестовый контур)")
    ap.add_argument("--settle", type=float, default=1.5,
                    help="сколько ждать после вызова, чтобы лог дописался")
    ap.add_argument("--timeout", type=float, default=120.0)
    a = ap.parse_args()

    inv = json.load(open(a.inventory, encoding="utf-8"))
    fixtures = {}
    if os.path.exists(a.fixtures):
        fixtures = json.load(open(a.fixtures, encoding="utf-8"))
    else:
        print(f"! {a.fixtures} не найден — инструменты с обязательными "
              f"параметрами будут пропущены", file=sys.stderr)

    if not os.path.exists(a.log):
        print(f"! лог {a.log} не существует. probe_tools должен работать на той же "
              f"машине, что и apiscope — он читает файл напрямую.", file=sys.stderr)

    tools = inv.get("tools", [])
    if a.only:
        want = {s.strip() for s in a.only.split(",")}
        tools = [t for t in tools if t["name"] in want]

    headers = {}
    if a.bearer:
        headers["Authorization"] = f"Bearer {a.bearer}"
    for env, hdr in [("PYRUS_LOGIN", "X-Pyrus-Login"),
                     ("PYRUS_SECURITY_KEY", "X-Pyrus-Security-Key"),
                     ("PYRUS_ACCESS_TOKEN", "X-Pyrus-Access-Token")]:
        if os.environ.get(env):
            headers[hdr] = os.environ[env]

    mcp = Mcp(a.url, headers, a.timeout)
    init = mcp.initialize()
    print(f"подключено: {(init or {}).get('serverInfo', {}).get('name', '?')}\n",
          file=sys.stderr)

    results: list[dict] = []
    for t in tools:
        name = t["name"]
        ann = t.get("annotations") or {}
        read_only = ann.get("readOnlyHint") is True

        if name in NEVER:
            results.append({"tool": name, "skipped": "в списке «никогда не трогать»"})
            continue
        if not read_only and not a.write:
            results.append({"tool": name,
                            "skipped": "пишущий инструмент, нужен флаг --write"})
            continue

        args, why = build_args(t, fixtures)
        if args is None:
            results.append({"tool": name, "skipped": why})
            continue

        args["api_url"] = a.api_url  # ← весь смысл упражнения

        before = count_lines(a.log)
        t0 = time.time()
        try:
            res = mcp.rpc("tools/call", {"name": name, "arguments": args})
            is_err = bool((res or {}).get("isError"))
            text = ""
            for c in (res or {}).get("content", []):
                if c.get("type") == "text":
                    text = c.get("text", "")[:300]
                    break
            status = "ошибка инструмента" if is_err else "ок"
        except Exception as e:
            status, text = "исключение", str(e)[:300]
        dt = round(time.time() - t0, 2)

        time.sleep(a.settle)
        after = count_lines(a.log)
        calls = read_slice(a.log, before, after)

        results.append({
            "tool": name, "args": {k: v for k, v in args.items() if k != "api_url"},
            "status": status, "seconds": dt, "note": text,
            "http_calls": [{
                "method": c["method"], "path": c["path"],
                "query": sorted((c.get("query") or {}).keys()),
                "body_keys": sorted(k for k in (c.get("req_body") or {})
                                    if isinstance(c.get("req_body"), dict)
                                    and not k.startswith("__")),
                "status": c["status"], "bytes": c["resp_bytes"],
            } for c in calls],
        })
        n = len(calls)
        eps = ", ".join(f"{c['method']} {c['path']}" for c in calls[:3]) or "—"
        print(f"  {name:<34} {status:<18} {n:>2} запрос(ов)  {eps}", file=sys.stderr)

    # ------------------------------------------------------------------ отчёт
    probed = [r for r in results if "skipped" not in r]
    skipped = [r for r in results if "skipped" in r]
    silent = [r for r in probed if not r["http_calls"]]

    L = ["# Карта: инструмент → эндпоинты Pyrus", "",
         f"Сервер: `{a.url}`  ",
         f"Прогнано инструментов: **{len(probed)}**, пропущено: {len(skipped)}  ",
         f"Всего наблюдалось HTTP-запросов к Pyrus: "
         f"**{sum(len(r['http_calls']) for r in probed)}**", "",
         "Получено наблюдением через apiscope: `api_url` направлен на прокси, "
         "который записал каждый исходящий запрос сервера. Это фактическое "
         "поведение, а не документация.", "",
         "## Сводка", "",
         "| Инструмент | Запросов | Эндпоинты | Итог |", "|---|--:|---|---|"]
    for r in probed:
        eps = "<br>".join(
            f"`{c['method']} {c['path']}`" + (f" ×{c['status']}" if c["status"] != 200 else "")
            for c in r["http_calls"]) or "_ни одного_"
        L.append(f"| `{r['tool']}` | {len(r['http_calls'])} | {eps} | {r['status']} |")

    if silent:
        L += ["", "## Инструменты, не сходившие в Pyrus ни разу", "",
              "Либо составная операция без сетевых вызовов, либо результат отдан "
              "из кэша, либо вызов упал до обращения к API. Смотрите колонку «итог».",
              ""]
        for r in silent:
            L.append(f"- `{r['tool']}` — {r['status']}"
                     + (f": {r['note'][:120]}" if r["note"] else ""))

    ep = Counter()
    for r in probed:
        for c in r["http_calls"]:
            ep[f"{c['method']} {c['path']}"] += 1
    if ep:
        L += ["", "## Эндпоинты по частоте", "", "| Эндпоинт | Вызовов |", "|---|--:|"]
        for k, n in ep.most_common():
            L.append(f"| `{k}` | {n} |")

    L += ["", "## Подробности по каждому инструменту", ""]
    for r in probed:
        L += [f"### `{r['tool']}`", "",
              f"Аргументы: `{json.dumps(r['args'], ensure_ascii=False)}`  ",
              f"Итог: {r['status']}, {r['seconds']} с", ""]
        if r["note"]:
            L += ["```", r["note"], "```", ""]
        if r["http_calls"]:
            L += ["| # | Запрос | Query | Тело | Код | Байт |", "|--:|---|---|---|--:|--:|"]
            for i, c in enumerate(r["http_calls"], 1):
                L.append(f"| {i} | `{c['method']} {c['path']}` | "
                         f"{', '.join(c['query']) or '—'} | "
                         f"{', '.join(c['body_keys']) or '—'} | {c['status']} | {c['bytes']} |")
            L.append("")

    if skipped:
        L += ["## Пропущено", ""]
        for r in skipped:
            L.append(f"- `{r['tool']}` — {r['skipped']}")
        L.append("")

    open(a.out, "w", encoding="utf-8").write("\n".join(L))
    json.dump(results, open(a.out.replace(".md", ".json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print(f"\n{a.out}: прогнано {len(probed)}, пропущено {len(skipped)}, "
          f"эндпоинтов найдено {len(ep)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
