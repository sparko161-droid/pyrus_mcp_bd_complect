#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pyruslab — измерить, как Pyrus API ведёт себя на ВАШИХ данных.

Не про чужой MCP-сервер. Про сам Pyrus: сколько задач теряется без
include_archived, какое окно по датам держит ответ в разумном размере,
включительна ли граница окна, какие параметры реально действуют, а какие
Pyrus принимает и молча игнорирует.

Главный приём здесь — **детектор эффекта**. Pyrus на неизвестный фильтр
отвечает 200 и полной выборкой, поэтому по коду ответа судить нельзя.
Лаборатория сравнивает результат с базовым замером и говорит одно из трёх:
параметр подействовал, был проигнорирован, или запрос отклонён.

Только чтение. Ни одного изменяющего вызова.

Запуск:
    export PYRUS_LOGIN=you@example.com
    export PYRUS_SECURITY_KEY=...
    python3 pyruslab.py --form-id 1504224 --task-id 372965117

Дополнительно:
    --api-url   свой контур или адрес apiscope
    --from/--to границы исследуемого периода (по умолчанию последние 2 года)
    --skip      разделы через запятую: registry,windows,eventlog,history
    --budget    предел числа запросов (лимит Pyrus — 5000 за 10 минут)
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    import httpx
except ImportError:
    sys.exit("Нужен httpx:  pip install httpx")

ISO = "%Y-%m-%dT%H:%M:%SZ"


def parse_dt(s: str) -> datetime | None:
    if not s:
        return None
    s = str(s).strip().replace("Z", "+00:00")
    for fmt in (None, "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            d = datetime.fromisoformat(s) if fmt is None else datetime.strptime(s, fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


class Pyrus:
    """Тонкий клиент со счётчиком запросов и учётом лимита."""

    def __init__(self, api_url: str, login: str, key: str, budget: int):
        self.api = api_url.rstrip("/")
        self.login, self.key = login, key
        self.token: str | None = None
        self.calls = 0
        self.budget = budget
        self.c = httpx.Client(timeout=180.0, follow_redirects=True)

    def auth(self) -> None:
        r = self.c.post(f"{self.api}/auth",
                        json={"login": self.login, "security_key": self.key})
        self.calls += 1
        r.raise_for_status()
        self.token = r.json()["access_token"]

    def get(self, path: str, params: dict | None = None) -> dict:
        """Вернуть {status, bytes, ms, json, error} — исключений не бросает."""
        if self.calls >= self.budget:
            raise RuntimeError(f"израсходован бюджет запросов ({self.budget})")
        t0 = time.time()
        try:
            r = self.c.get(f"{self.api}{path}",
                           headers={"Authorization": f"Bearer {self.token}"},
                           params={k: v for k, v in (params or {}).items()
                                   if v is not None})
            self.calls += 1
            body = r.content
            try:
                data = r.json()
            except Exception:
                data = None
            return {"status": r.status_code, "bytes": len(body),
                    "ms": round((time.time() - t0) * 1000), "json": data,
                    "text": body[:300].decode("utf-8", "replace") if data is None else "",
                    "error": None}
        except Exception as e:
            self.calls += 1
            return {"status": 0, "bytes": 0, "ms": round((time.time() - t0) * 1000),
                    "json": None, "text": "", "error": str(e)}


def tasks_of(res: dict) -> list:
    j = res.get("json")
    if isinstance(j, dict):
        for k in ("tasks", "items", "results"):
            if isinstance(j.get(k), list):
                return j[k]
    return j if isinstance(j, list) else []


def fmt_bytes(n: int) -> str:
    for unit, div in (("МБ", 1 << 20), ("КБ", 1 << 10)):
        if n >= div:
            return f"{n / div:.1f} {unit}"
    return f"{n} Б"


# ==================================================================== эксперименты


def exp_registry_flags(p: Pyrus, form_id: int, log: list) -> dict:
    """Базовый замер + эффект каждого флага по отдельности."""
    base = p.get(f"/forms/{form_id}/register")
    n_base = len(tasks_of(base))
    log.append(f"базовый реестр: {n_base} задач, {fmt_bytes(base['bytes'])}, "
               f"{base['ms']} мс, код {base['status']}")

    out = {"baseline": {"count": n_base, "bytes": base["bytes"],
                        "ms": base["ms"], "status": base["status"]},
           "params": []}

    if base["status"] != 200:
        out["fatal"] = f"базовый запрос вернул {base['status']}: {base['text'][:200]}"
        return out

    # Детектор эффекта: сравниваем с базой. Одинаковый результат при коде 200
    # означает «параметр принят и проигнорирован» — самый опасный случай.
    probes = [
        ("include_archived", True, "включить закрытые задачи"),
        ("item_count", 10, "ограничить число задач"),
        ("field_ids", "1,2", "вернуть только эти поля"),
        ("steps", 1, "только первый шаг маршрута"),
        ("modified_after", (datetime.now(timezone.utc) - timedelta(days=30)).strftime(ISO),
         "изменённые за 30 дней"),
        ("created_after", (datetime.now(timezone.utc) - timedelta(days=30)).strftime(ISO),
         "созданные за 30 дней"),
        ("created_before", (datetime.now(timezone.utc) - timedelta(days=365)).strftime(ISO),
         "созданные больше года назад"),
        ("include_all_fields", True, "недокументированный — проверяем наугад"),
        ("zzz_nonexistent_param", "проверка", "заведомо несуществующий — контроль"),
    ]

    for name, value, human in probes:
        r = p.get(f"/forms/{form_id}/register", {name: value})
        n = len(tasks_of(r))
        if r["status"] != 200:
            verdict, mark = f"отклонён (код {r['status']})", "reject"
        elif n != n_base or abs(r["bytes"] - base["bytes"]) > max(64, base["bytes"] * 0.02):
            verdict, mark = "ПОДЕЙСТВОВАЛ", "effect"
        else:
            verdict, mark = "принят, но результат не изменился", "ignored"
        out["params"].append({
            "param": name, "value": value, "human": human, "status": r["status"],
            "count": n, "bytes": r["bytes"], "ms": r["ms"],
            "delta_count": n - n_base, "verdict": verdict, "mark": mark,
        })
        log.append(f"  {name:<24} → {n:>6} задач ({n - n_base:+}), "
                   f"{fmt_bytes(r['bytes']):>9}  {verdict}")

    arch = next((x for x in out["params"] if x["param"] == "include_archived"), None)
    if arch and arch["mark"] == "effect" and arch["count"] > n_base:
        hidden = arch["count"] - n_base
        out["archived_finding"] = {
            "open_only": n_base, "all": arch["count"], "hidden": hidden,
            "share": round(hidden / arch["count"] * 100, 1),
        }
    ctrl = next((x for x in out["params"] if x["param"] == "zzz_nonexistent_param"), None)
    if ctrl:
        out["unknown_param_silently_ignored"] = (ctrl["mark"] == "ignored")
    return out


def exp_payload(p: Pyrus, form_id: int, log: list) -> dict:
    """Насколько сжимается ответ. Все замеры с include_archived — иначе неправда."""
    combos = [
        ("всё как есть", {"include_archived": True}),
        ("+ item_count=100", {"include_archived": True, "item_count": 100}),
        ("+ field_ids=1,2", {"include_archived": True, "field_ids": "1,2"}),
        ("+ то и другое", {"include_archived": True, "item_count": 100,
                           "field_ids": "1,2"}),
    ]
    rows = []
    for label, params in combos:
        r = p.get(f"/forms/{form_id}/register", params)
        rows.append({"label": label, "params": params, "bytes": r["bytes"],
                     "count": len(tasks_of(r)), "ms": r["ms"], "status": r["status"]})
        log.append(f"  {label:<18} {fmt_bytes(r['bytes']):>9}  "
                   f"{len(tasks_of(r)):>6} задач  {r['ms']:>5} мс")
    if rows and rows[0]["bytes"]:
        for row in rows:
            row["reduction"] = round(100 * (1 - row["bytes"] / rows[0]["bytes"]))
    # Грубая прикидка в токенах: ~4 байта на токен для русского JSON.
    for row in rows:
        row["approx_tokens"] = row["bytes"] // 4
    return {"combos": rows}


def exp_windows(p: Pyrus, form_id: int, dt_from: datetime, dt_to: datetime,
                log: list) -> dict:
    """
    Сколько запросов и какого размера ответ при разной ширине окна.
    Не обходим весь период целиком — берём по три пробных окна на каждую
    ширину, иначе сожжём лимит.
    """
    results = []
    for days in (365, 90, 30, 7):
        total = (dt_to - dt_from).days or 1
        n_windows = max(1, -(-total // days))
        probes, cursor = [], dt_to
        for _ in range(min(3, n_windows)):
            start = cursor - timedelta(days=days)
            r = p.get(f"/forms/{form_id}/register", {
                "include_archived": True,
                "created_after": start.strftime(ISO),
                "created_before": cursor.strftime(ISO),
            })
            probes.append({"from": start.strftime(ISO), "to": cursor.strftime(ISO),
                           "count": len(tasks_of(r)), "bytes": r["bytes"],
                           "ms": r["ms"], "status": r["status"]})
            cursor = start
        ok = [x for x in probes if x["status"] == 200]
        row = {
            "days": days, "windows_for_period": n_windows, "probes": probes,
            "max_bytes": max((x["bytes"] for x in ok), default=0),
            "max_count": max((x["count"] for x in ok), default=0),
            "median_bytes": int(statistics.median([x["bytes"] for x in ok])) if ok else 0,
            "median_ms": int(statistics.median([x["ms"] for x in ok])) if ok else 0,
            "errors": [x["status"] for x in probes if x["status"] != 200],
        }
        results.append(row)
        log.append(f"  окно {days:>3} дн: {n_windows:>4} окон на период, "
                   f"максимум {fmt_bytes(row['max_bytes']):>9} / "
                   f"{row['max_count']:>5} задач, медиана {row['median_ms']} мс"
                   + (f"  ОШИБКИ: {row['errors']}" if row["errors"] else ""))

    # Рекомендация: самое широкое окно, у которого максимум держится под 1 МБ
    # (порядка 250 тыс. токенов — уже много, но ещё обозримо) и нет ошибок.
    fit = [r for r in results if r["max_bytes"] and r["max_bytes"] < (1 << 20)
           and not r["errors"]]
    rec = max(fit, key=lambda r: r["days"]) if fit else None
    return {"sweep": results,
            "recommended_days": rec["days"] if rec else None,
            "recommended_requests": rec["windows_for_period"] if rec else None}


def exp_boundary(p: Pyrus, form_id: int, dt_from: datetime, dt_to: datetime,
                 log: list) -> dict:
    """
    Включительна ли граница окна. От этого зависит, будет ли инкрементальная
    выгрузка дублировать записи или терять их.

    Берём окно, находим самую свежую create_date, затем запрашиваем окно,
    начинающееся ровно с неё. Если пограничная задача пришла снова —
    created_after включительный, и при склейке окон нужен сдвиг на секунду
    либо дедупликация по id.
    """
    r1 = p.get(f"/forms/{form_id}/register", {
        "include_archived": True,
        "created_after": dt_from.strftime(ISO),
        "created_before": dt_to.strftime(ISO),
    })
    tasks = tasks_of(r1)
    dated = [(t, parse_dt(t.get("create_date") or t.get("created_at") or ""))
             for t in tasks]
    dated = [(t, d) for t, d in dated if d]
    if not dated:
        log.append("  нет поля create_date в ответе — границу проверить нечем")
        return {"determined": False,
                "reason": "в задачах реестра нет create_date (или другое имя поля)"}

    dated.sort(key=lambda x: x[1])
    edge_task, edge_dt = dated[-1]
    edge_id = edge_task.get("id")

    r2 = p.get(f"/forms/{form_id}/register", {
        "include_archived": True,
        "created_after": edge_dt.strftime(ISO),
        "created_before": dt_to.strftime(ISO),
    })
    again = [t.get("id") for t in tasks_of(r2)]
    inclusive = edge_id in again

    log.append(f"  пограничная задача id={edge_id} ({edge_dt.strftime(ISO)}): "
               + ("пришла повторно → created_after ВКЛЮЧИТЕЛЬНЫЙ"
                  if inclusive else "не пришла → created_after исключающий"))

    return {
        "determined": True,
        "edge_task_id": edge_id,
        "edge_create_date": edge_dt.strftime(ISO),
        "inclusive": inclusive,
        "repeat_count": len(again),
        "rule": ("created_after включает саму границу: при склейке окон "
                 "дедуплицируйте по id либо сдвигайте начало на +1 секунду"
                 if inclusive else
                 "created_after не включает границу: можно брать последнюю "
                 "create_date как начало следующего окна без сдвига"),
    }


def exp_eventlog(p: Pyrus, dt_from: datetime, dt_to: datetime, log: list) -> dict:
    """Пять CSV-выгрузок журнала: доступны ли и какие параметры принимают."""
    endpoints = ["/eventhistory", "/fileaccesshistory", "/taskaccesshistory",
                 "/taskexporthistory", "/registrydownloadhistory"]
    rows = []
    for ep in endpoints:
        bare = p.get(ep)
        ranged = p.get(ep, {"created_after": dt_from.strftime(ISO),
                            "created_before": dt_to.strftime(ISO)})
        row = {
            "endpoint": ep,
            "bare_status": bare["status"], "bare_bytes": bare["bytes"],
            "ranged_status": ranged["status"], "ranged_bytes": ranged["bytes"],
            "range_has_effect": (ranged["status"] == 200 and bare["status"] == 200
                                 and ranged["bytes"] != bare["bytes"]),
            "note": (bare["text"] or "")[:160],
        }
        rows.append(row)
        log.append(f"  {ep:<28} без дат: {bare['status']} "
                   f"{fmt_bytes(bare['bytes']):>9} | с датами: {ranged['status']} "
                   f"{fmt_bytes(ranged['bytes']):>9}"
                   + ("  ← диапазон действует" if row["range_has_effect"] else ""))
    return {"endpoints": rows}


def exp_task_history(p: Pyrus, task_id: int, log: list) -> dict:
    """Есть ли в задаче то, из чего можно собрать переходы по этапам."""
    r = p.get(f"/tasks/{task_id}")
    if r["status"] != 200:
        log.append(f"  задача {task_id}: код {r['status']}")
        return {"status": r["status"], "note": r["text"][:200]}
    task = (r["json"] or {}).get("task") or r["json"] or {}
    comments = task.get("comments") or []

    def keys_of(d):
        return sorted(d.keys()) if isinstance(d, dict) else []

    step_marks = [c for c in comments
                  if isinstance(c, dict) and any(
                      k in c for k in ("field_updates", "approval_choice",
                                       "reassigned_to", "changed_step", "current_step"))]
    dated = [c for c in comments if isinstance(c, dict) and c.get("create_date")]
    out = {
        "status": 200, "bytes": r["bytes"],
        "task_keys": keys_of(task),
        "comments_total": len(comments),
        "comments_with_date": len(dated),
        "comments_carrying_step_signal": len(step_marks),
        "comment_keys_union": sorted({k for c in comments if isinstance(c, dict)
                                      for k in c}),
        "has_current_step": "current_step" in task,
    }
    log.append(f"  задача {task_id}: {len(comments)} комментариев, "
               f"{len(dated)} с датой, {len(step_marks)} со следами перехода; "
               f"current_step в задаче: {'да' if out['has_current_step'] else 'нет'}")
    out["process_mining_ready"] = bool(dated and (step_marks or out["has_current_step"]))
    return out


# ==================================================================== отчёт


def build_report(res: dict, meta: dict) -> str:
    L = ["# Лаборатория Pyrus API — измерения на ваших данных", "",
         f"Контур: `{meta['api_url']}`  ",
         f"Форма: `{meta['form_id']}`  ",
         f"Период: {meta['from']} — {meta['to']}  ",
         f"Снято: {meta['when']}  ",
         f"Израсходовано запросов: **{meta['calls']}** "
         f"(лимит Pyrus — 5000 за 10 минут)", ""]

    reg = res.get("registry") or {}
    if reg.get("archived_finding"):
        a = reg["archived_finding"]
        L += ["## ⚠ Главное", "",
              f"Без `include_archived` реестр отдаёт **{a['open_only']}** задач "
              f"вместо **{a['all']}**. Скрыто **{a['hidden']}** задач — "
              f"**{a['share']}%** выборки, молча, без единого признака в ответе.", "",
              "Любая аналитика по процессу без этого флага будет неверной.", ""]
    elif reg.get("baseline"):
        L += ["## Главное", "",
              "`include_archived` на этой форме не изменил результат — либо "
              "закрытых задач нет, либо флаг не поддерживается. Проверьте на "
              "форме с закрытыми задачами.", ""]

    if reg.get("params"):
        L += ["## Какие параметры реально действуют", "",
              "Pyrus отвечает `200` и на неизвестный параметр, поэтому судим по "
              "изменению результата, а не по коду.", "",
              "| Параметр | Смысл | Код | Задач | Δ | Вердикт |",
              "|---|---|--:|--:|--:|---|"]
        icon = {"effect": "✅", "ignored": "⚪", "reject": "❌"}
        for x in reg["params"]:
            L.append(f"| `{x['param']}` | {x['human']} | {x['status']} | "
                     f"{x['count']} | {x['delta_count']:+} | "
                     f"{icon.get(x['mark'],'')} {x['verdict']} |")
        L.append("")
        if reg.get("unknown_param_silently_ignored"):
            L += ["Контрольный несуществующий параметр принят с кодом `200` и "
                  "полной выборкой. Подтверждено: **опечатка в имени фильтра "
                  "выглядит как успешный запрос.** Валидацию имён держите у себя.",
                  ""]

    pay = res.get("payload") or {}
    if pay.get("combos"):
        L += ["## Размер ответа", "",
              "| Запрос | Байт | ≈ токенов | Задач | Сжатие |", "|---|--:|--:|--:|--:|"]
        for c in pay["combos"]:
            L.append(f"| {c['label']} | {fmt_bytes(c['bytes'])} | "
                     f"{c['approx_tokens']:,} | {c['count']} | "
                     f"{c.get('reduction', 0)}% |".replace(",", " "))
        L.append("")

    w = res.get("windows") or {}
    if w.get("sweep"):
        L += ["## Окна по датам", "",
              "Курсора и смещения у Pyrus нет — большой реестр берут окнами. "
              "Замерено по три пробных окна на каждую ширину.", "",
              "| Ширина | Окон на период | Макс. байт | Макс. задач | Медиана мс | Ошибки |",
              "|--:|--:|--:|--:|--:|---|"]
        for r in w["sweep"]:
            L.append(f"| {r['days']} дн | {r['windows_for_period']} | "
                     f"{fmt_bytes(r['max_bytes'])} | {r['max_count']} | "
                     f"{r['median_ms']} | {r['errors'] or '—'} |")
        L.append("")
        if w.get("recommended_days"):
            L += [f"**Рекомендация: окно {w['recommended_days']} дней** — "
                  f"{w['recommended_requests']} запросов на весь период, "
                  f"каждый ответ меньше 1 МБ.", ""]
        else:
            L += ["Ни одна ширина не уложилась в 1 МБ без ошибок. Сужайте окно "
                  "дальше либо обязательно используйте `field_ids`.", ""]

    b = res.get("boundary") or {}
    if b.get("determined"):
        L += ["## Граница окна", "",
              f"Пограничная задача `{b['edge_task_id']}` "
              f"({b['edge_create_date']}) при повторном запросе "
              + ("**пришла снова**." if b["inclusive"] else "**не пришла**."), "",
              f"**Правило: {b['rule']}**", "",
              "Это определяет, будет ли инкрементальная выгрузка дублировать "
              "записи на стыках окон или терять их.", ""]
    elif b:
        L += ["## Граница окна", "", f"Определить не удалось: {b.get('reason')}", ""]

    e = res.get("eventlog") or {}
    if e.get("endpoints"):
        L += ["## Журнал событий", "",
              "| Эндпоинт | Без дат | С датами | Диапазон действует |",
              "|---|---|---|---|"]
        for r in e["endpoints"]:
            L.append(f"| `{r['endpoint']}` | {r['bare_status']} "
                     f"{fmt_bytes(r['bare_bytes'])} | {r['ranged_status']} "
                     f"{fmt_bytes(r['ranged_bytes'])} | "
                     f"{'да' if r['range_has_effect'] else 'нет'} |")
        L.append("")

    h = res.get("history") or {}
    if h.get("status") == 200:
        L += ["## Пригодность задач для process mining", "",
              f"- комментариев: {h['comments_total']}, из них с датой: "
              f"{h['comments_with_date']}",
              f"- со следами перехода по маршруту: {h['comments_carrying_step_signal']}",
              f"- `current_step` в самой задаче: "
              f"{'есть' if h['has_current_step'] else 'нет'}",
              f"- поля комментариев: `{'`, `'.join(h['comment_keys_union'][:25])}`", "",
              ("**Событийный лог собрать можно**: у комментариев есть время и "
               "признаки перехода."
               if h.get("process_mining_ready") else
               "**Событийный лог из этого не собрать**: нет времени или нет "
               "признаков перехода. Берите журнал событий."), ""]

    L += ["---", "",
          "Все замеры сделаны только чтением, ни одного изменяющего вызова.", ""]
    return "\n".join(L)


# ==================================================================== точка входа


def main() -> int:
    ap = argparse.ArgumentParser(description="Измерить поведение Pyrus API")
    ap.add_argument("--api-url", default=os.environ.get("PYRUS_API_URL",
                                                        "https://api.pyrus.com/v4"))
    ap.add_argument("--login", default=os.environ.get("PYRUS_LOGIN"))
    ap.add_argument("--key", default=os.environ.get("PYRUS_SECURITY_KEY"))
    ap.add_argument("--form-id", type=int, required=True)
    ap.add_argument("--task-id", type=int)
    ap.add_argument("--from", dest="dt_from")
    ap.add_argument("--to", dest="dt_to")
    ap.add_argument("--skip", default="")
    ap.add_argument("--budget", type=int, default=200)
    ap.add_argument("--out", default="LAB.md")
    a = ap.parse_args()

    if not a.login or not a.key:
        return ap.error("нужны --login и --key (или PYRUS_LOGIN / PYRUS_SECURITY_KEY)")

    dt_to = parse_dt(a.dt_to) or datetime.now(timezone.utc)
    dt_from = parse_dt(a.dt_from) or (dt_to - timedelta(days=730))
    skip = {s.strip() for s in a.skip.split(",") if s.strip()}

    p = Pyrus(a.api_url, a.login, a.key, a.budget)
    print(f"авторизация на {a.api_url}…", file=sys.stderr)
    try:
        p.auth()
    except Exception as e:
        print(f"не удалось авторизоваться: {e}", file=sys.stderr)
        return 2

    res, log = {}, []
    try:
        if "registry" not in skip:
            print("\n[1/5] флаги реестра и детектор эффекта", file=sys.stderr)
            res["registry"] = exp_registry_flags(p, a.form_id, log)
            if res["registry"].get("fatal"):
                print(f"  {res['registry']['fatal']}", file=sys.stderr)

            print("\n[2/5] размер ответа", file=sys.stderr)
            res["payload"] = exp_payload(p, a.form_id, log)

        if "windows" not in skip:
            print("\n[3/5] окна по датам", file=sys.stderr)
            res["windows"] = exp_windows(p, a.form_id, dt_from, dt_to, log)
            print("\n[4/5] граница окна", file=sys.stderr)
            res["boundary"] = exp_boundary(p, a.form_id, dt_from, dt_to, log)

        if "eventlog" not in skip:
            print("\n[5/5] журнал событий", file=sys.stderr)
            res["eventlog"] = exp_eventlog(p, dt_from, dt_to, log)

        if a.task_id and "history" not in skip:
            print("\n[+] история задачи", file=sys.stderr)
            res["history"] = exp_task_history(p, a.task_id, log)
    except RuntimeError as e:
        print(f"\nостановлено: {e}", file=sys.stderr)

    for line in log:
        print("  " + line, file=sys.stderr)

    meta = {"api_url": a.api_url, "form_id": a.form_id,
            "from": dt_from.strftime(ISO), "to": dt_to.strftime(ISO),
            "when": datetime.now(timezone.utc).strftime(ISO), "calls": p.calls}
    open(a.out, "w", encoding="utf-8").write(build_report(res, meta))
    json.dump({"meta": meta, "results": res},
              open(a.out.replace(".md", ".json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2, default=str)
    print(f"\n{a.out} готов. Запросов израсходовано: {p.calls}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
