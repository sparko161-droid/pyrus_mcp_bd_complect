#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Заглушка Pyrus с настоящим набором данных — чтобы проверить лабораторию
на известной истине.

Генерирует 3046 задач за два года, из них 2365 закрытых, разбросанных по
шагам маршрута 1..20 (закрытые НЕ только на последнем шаге — как в жизни).
Повторяет неприятные повадки настоящего Pyrus:

  * без include_archived отдаёт только открытые задачи и ничем это не выдаёт;
  * на неизвестный параметр отвечает 200 и полной выборкой;
  * created_after ВКЛЮЧИТЕЛЬНЫЙ — граница попадает в обе соседние выборки;
  * признака is_closed в реестре нет.

Флагами можно переключить поведение, чтобы проверить, что лаборатория
определяет его, а не угадывает:
    --exclusive-boundary   сделать created_after исключающим
    --strict-params        отвечать 400 на неизвестный параметр
    --no-archive-flag      игнорировать include_archived

Запуск: python3 fake_pyrus_rich.py --port 8092
"""

import argparse
import json
import random
import re
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

TOTAL, CLOSED = 3046, 2365
ISO = "%Y-%m-%dT%H:%M:%SZ"

CFG = {"exclusive_boundary": False, "strict_params": False, "archive_flag": True}

KNOWN = {"include_archived", "item_count", "field_ids", "steps",
         "modified_after", "modified_before", "created_after", "created_before",
         "field_filters"}

_now = datetime(2026, 8, 17, tzinfo=timezone.utc)
_rng = random.Random(20260817)

TASKS = []
for i in range(TOTAL):
    created = _now - timedelta(days=_rng.uniform(0, 730),
                               seconds=_rng.uniform(0, 86400))
    closed = i < CLOSED
    # Закрытые встречаются на разных шагах, а не только на последнем —
    # именно это ломает наивную догадку «закрытые = последний шаг».
    step = _rng.choice([2, 3, 5] * 5 + list(range(1, 21))) if closed \
        else _rng.randint(1, 20)
    TASKS.append({
        "id": 300000 + i,
        "create_date": created.strftime(ISO),
        "last_modified_date": (created + timedelta(days=_rng.uniform(0, 30))).strftime(ISO),
        "current_step": step,
        "_closed": closed,
        "subject": f"Заявка №{300000 + i}",
        "fields": [
            {"id": 1, "name": "Контрагент", "value": f"ООО «Компания {i % 137}»"},
            {"id": 2, "name": "Сумма", "value": round(_rng.uniform(1000, 900000), 2)},
            {"id": 6, "name": "Статья", "value": f"Статья бюджета {i % 23}"},
            {"id": 9, "name": "Комментарий",
             "value": "Развёрнутое описание заявки. " * 12},
        ],
    })
TASKS.sort(key=lambda t: t["create_date"])


def registry(q: dict):
    def one(k, default=None):
        v = q.get(k)
        return v[0] if v else default

    unknown = set(q) - KNOWN
    if unknown and CFG["strict_params"]:
        return 400, {"error_code": "unknown_parameter", "params": sorted(unknown)}
    # Настоящий Pyrus неизвестный параметр молча проглатывает.

    rows = TASKS
    if CFG["archive_flag"]:
        if str(one("include_archived", "false")).lower() not in ("true", "1"):
            rows = [t for t in rows if not t["_closed"]]

    ca, cb = one("created_after"), one("created_before")
    if ca:
        rows = ([t for t in rows if t["create_date"] > ca]
                if CFG["exclusive_boundary"] else
                [t for t in rows if t["create_date"] >= ca])
    if cb:
        rows = [t for t in rows if t["create_date"] < cb]
    if one("modified_after"):
        rows = [t for t in rows if t["last_modified_date"] >= one("modified_after")]

    steps = one("steps")
    if steps:
        want = {int(s) for s in re.findall(r"\d+", str(steps))}
        rows = [t for t in rows if t["current_step"] in want]

    field_ids = one("field_ids")
    keep = {int(s) for s in re.findall(r"\d+", field_ids)} if field_ids else None

    ic = one("item_count")
    if ic and str(ic).isdigit():
        rows = rows[:int(ic)]

    out = []
    for t in rows:
        r = {k: v for k, v in t.items() if not k.startswith("_")}
        if keep is not None:
            r["fields"] = [f for f in t["fields"] if f["id"] in keep]
        out.append(r)
    return 200, {"tasks": out}


def task_detail(tid: int):
    base = _now - timedelta(days=40)
    return 200, {"task": {
        "id": tid, "subject": "Заявка на оплату", "current_step": 5,
        "create_date": base.strftime(ISO),
        "comments": [
            {"id": 1, "create_date": base.strftime(ISO),
             "author": {"id": 1, "email": "a@x.ru"}, "text": "Создана"},
            {"id": 2, "create_date": (base + timedelta(days=1)).strftime(ISO),
             "author": {"id": 2, "email": "b@x.ru"}, "approval_choice": "approved",
             "changed_step": 2},
            {"id": 3, "create_date": (base + timedelta(days=4)).strftime(ISO),
             "author": {"id": 3, "email": "c@x.ru"},
             "field_updates": [{"id": 2, "value": 120000}], "changed_step": 5},
        ],
    }}


ROUTES = [
    (r"^/v4/auth$", "POST", lambda m, q: (200, {"access_token": "lab-token"})),
    (r"^/v4/forms/(\d+)/register$", "GET", lambda m, q: registry(q)),
    (r"^/v4/tasks/(\d+)$", "GET", lambda m, q: task_detail(int(m.group(1)))),
    (r"^/v4/eventhistory$", "GET", lambda m, q: (
        200, {"csv": "date,event\n" + "2026-01-01,opened\n" * (
            40 if q.get("created_after") else 400)})),
    (r"^/v4/fileaccesshistory$", "GET", lambda m, q: (200, {"csv": "date,file\n"})),
    (r"^/v4/taskaccesshistory$", "GET", lambda m, q: (403, {"error": "нет прав"})),
    (r"^/v4/taskexporthistory$", "GET", lambda m, q: (200, {"csv": "date,task\n"})),
    (r"^/v4/registrydownloadhistory$", "GET", lambda m, q: (200, {"csv": "date,form\n"})),
]


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _go(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            self.rfile.read(n)
        code, payload = 404, {"error_code": "not_found", "path": u.path}
        for pattern, verb, fn in ROUTES:
            m = re.match(pattern, u.path)
            if m and verb == self.command:
                code, payload = fn(m, q)
                break
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = do_POST = _go


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8092)
    ap.add_argument("--exclusive-boundary", action="store_true")
    ap.add_argument("--strict-params", action="store_true")
    ap.add_argument("--no-archive-flag", action="store_true")
    a = ap.parse_args()
    CFG.update(exclusive_boundary=a.exclusive_boundary,
               strict_params=a.strict_params,
               archive_flag=not a.no_archive_flag)
    print(f"заглушка Pyrus :{a.port} — {TOTAL} задач, {CLOSED} закрытых, "
          f"граница {'исключающая' if a.exclusive_boundary else 'включительная'}")
    ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()
