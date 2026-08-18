#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сквозной тест банка: проходит весь путь, ради которого он строился.

  Иван пишет решение в свою зону → правит его (версия 2) → смотрит дифф →
  предлагает в общий банк → Пётр (не ревьюер) получает отказ → Мария (ревьюер)
  одобряет → решение находится поиском в общей зоне → Пётр отмечает, что помогло.

Плюс проверки прав: в общую зону напрямую не пишется, в чужую личную тоже.

Запуск: BANK_URL=http://127.0.0.1:8080/mcp BANK_TOKEN=… python3 smoke_test.py
"""

import json
import os
import sys

import httpx

URL = os.environ.get("BANK_URL", "http://127.0.0.1:8080/mcp")
TOKEN = os.environ.get("BANK_TOKEN", "test-token")

_id = 0
failures: list[str] = []


def call(actor: str, tool: str, args: dict | None = None) -> dict:
    global _id
    _id += 1
    r = httpx.post(URL, timeout=30.0, headers={
        "Authorization": f"Bearer {TOKEN}",
        "X-Bank-Actor": actor,
        "Content-Type": "application/json",
    }, json={"jsonrpc": "2.0", "id": _id, "method": "tools/call",
             "params": {"name": tool, "arguments": args or {}}})
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(f"RPC: {body['error']}")
    res = body["result"]
    if res.get("isError"):
        return {"__error__": res["content"][0]["text"]}
    return res.get("structuredContent") or json.loads(res["content"][0]["text"])


def check(label: str, cond: bool, detail: str = "") -> None:
    mark = "✓" if cond else "✗"
    print(f"  {mark} {label}" + (f"  — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(label)


IVAN, PETR, MARIA = "ivan@example.com", "petr@example.com", "maria@example.com"

print("\n== 1. Зоны заводятся сами при первом обращении ==")
z = call(IVAN, "list_zones")
check("у Ивана появилась личная зона", any(x["key"] == f"u:{IVAN}" for x in z["zones"]))
check("общая зона видна", any(x["kind"] == "shared" for x in z["zones"]))

print("\n== 2. Запись в свою зону ==")
e1 = call(IVAN, "put_entry", {
    "kind": "solution",
    "title": "Выгрузка полного реестра формы Pyrus без потери закрытых задач",
    "summary": "Реестр Pyrus по умолчанию отдаёт только открытые задачи. "
               "Нужен include_archived, иначе выборка молча теряет большую часть.",
    "body": "## Проблема\n\nБез `include_archived: true` вернулось 681 задача "
            "вместо 3046.\n\n## Решение\n\nВсегда передавайте флаг. Закрытые = "
            "разница между выборкой с флагом и без.\n\n```python\n"
            "registry(form_id=1504224, include_archived=True)\n```",
    "tags": ["pyrus", "реестр", "выгрузка"],
    "payload": {"form_id": 1504224, "flag": "include_archived"},
    "change_note": "первая версия",
})
check("запись создана", e1.get("created") is True and e1["version"] == 1)
check("ушла в личную зону Ивана", e1["zone"] == f"u:{IVAN}", str(e1.get("zone")))

print("\n== 3. Повторная запись того же содержимого не плодит версий ==")
same = call(IVAN, "put_entry", {
    "kind": "solution", "slug": e1["slug"],
    "title": "Выгрузка полного реестра формы Pyrus без потери закрытых задач",
    "summary": "Реестр Pyrus по умолчанию отдаёт только открытые задачи. "
               "Нужен include_archived, иначе выборка молча теряет большую часть.",
    "body": "## Проблема\n\nБез `include_archived: true` вернулось 681 задача "
            "вместо 3046.\n\n## Решение\n\nВсегда передавайте флаг. Закрытые = "
            "разница между выборкой с флагом и без.\n\n```python\n"
            "registry(form_id=1504224, include_archived=True)\n```",
    "tags": ["pyrus", "реестр", "выгрузка"],
    "payload": {"form_id": 1504224, "flag": "include_archived"},
})
check("версия не выросла", same.get("unchanged") is True and same["version"] == 1)

print("\n== 4. Правка создаёт версию 2, версия 1 остаётся ==")
e2 = call(IVAN, "put_entry", {
    "kind": "solution", "slug": e1["slug"],
    "title": "Выгрузка полного реестра формы Pyrus без потери закрытых задач",
    "summary": "Реестр Pyrus по умолчанию отдаёт только открытые задачи. "
               "Нужен include_archived. Плюс окна по датам для больших форм.",
    "body": "## Проблема\n\nБез `include_archived: true` вернулось 681 задача "
            "вместо 3046.\n\n## Решение\n\nВсегда передавайте флаг.\n\n"
            "## Большие реестры\n\nКурсора у Pyrus нет — обходите окнами по "
            "`created_after`/`created_before`, запоминая последнюю `create_date`.",
    "tags": ["pyrus", "реестр", "выгрузка", "пагинация"],
    "payload": {"form_id": 1504224, "flag": "include_archived", "paging": "date-window"},
    "change_note": "добавил обход окнами по датам",
})
check("создана версия 2", e2["version"] == 2 and e2["entry_id"] == e1["entry_id"])
hist = call(IVAN, "list_versions", {"entry_id": e1["entry_id"]})
check("в истории две версии", len(hist["versions"]) == 2)

print("\n== 5. Дифф версий ==")
d = call(IVAN, "diff_versions", {
    "from_version_id": e1["version_id"], "to_version_id": e2["version_id"]})
check("текстовый дифф непустой", "Большие реестры" in d["text_diff"])
check("виден новый ключ payload", "paging" in d["payload_added"], str(d["payload_added"]))
check("виден новый тег", "пагинация" in d["tags_added"], str(d["tags_added"]))

print("\n== 6. Права на запись ==")
r = call(IVAN, "put_entry", {"kind": "note", "title": "Прямо в общую", "zone": "shared"})
check("в общую зону писать нельзя",
      "__error__" in r and "напрямую" in r["__error__"], str(r))
r = call(PETR, "put_entry", {"kind": "note", "title": "В чужую личную",
                             "zone": f"u:{IVAN}"})
check("в чужую личную писать нельзя", "__error__" in r and "личная зона" in r["__error__"])

print("\n== 7. Промоушен ==")
call(IVAN, "list_zones")  # чтобы зоны точно существовали
os.system(f"""psql -h /tmp -p 5433 -U postgres -d bank -qc \
  "UPDATE zone SET reviewers = ARRAY['{MARIA}'] WHERE key='shared';" """)
p = call(IVAN, "propose_promotion", {
    "version_id": e2["version_id"],
    "rationale": "На эти грабли наступит каждый, кто трогает реестры."})
check("заявка создана", p.get("state") == "pending", str(p))
check("ревьюер подставился", MARIA in (p.get("reviewers") or []), str(p.get("reviewers")))

dup = call(IVAN, "propose_promotion", {"version_id": e2["version_id"]})
check("повторная заявка на ту же версию отклонена",
      "__error__" in dup and "уже открыта" in dup["__error__"])

seen = call(PETR, "list_promotions", {})
check("Пётр видит заявку в очереди", any(x["id"] == p["promotion_id"] for x in seen["promotions"]))
check("но помечен как не-ревьюер",
      seen["promotions"][0]["you_can_review"] is False)

bad = call(PETR, "review_promotion", {"promotion_id": p["promotion_id"],
                                      "decision": "approve"})
check("не-ревьюер одобрить не может", "__error__" in bad and "не ревьюер" in bad["__error__"])

ok = call(MARIA, "review_promotion", {
    "promotion_id": p["promotion_id"], "decision": "approve",
    "note": "Полезно, забираем."})
check("ревьюер одобрил", ok.get("state") == "approved", str(ok))
check("создалась запись в общей зоне", ok.get("target_zone") == "shared")

print("\n== 8. Поиск находит продвинутое решение ==")
s = call(PETR, "search", {"q": "реестр Pyrus теряет закрытые задачи"})
check("поиск что-то нашёл", s["count"] > 0, json.dumps(s)[:200])
in_shared = [x for x in s["results"] if x["zone_key"] == "shared"]
check("нашлось именно в общей зоне", len(in_shared) > 0,
      str([x["zone_key"] for x in s["results"]]))
check("режим честно указан как text (эмбеддинги не настроены)", s["mode"] == "text")
check("есть предупреждение про векторную часть", bool(s.get("note")))

s2 = call(PETR, "search", {"q": "пагинация", "kinds": ["solution"]})
check("фильтр по типу работает", all(x["kind"] == "solution" for x in s2["results"]))
s3 = call(PETR, "search", {"q": "реестр", "tags": ["несуществующий-тег"]})
check("фильтр по тегам отсекает", s3["count"] == 0)

print("\n== 9. Изоляция зон: Пётр не видит личную зону Ивана ==")
s4 = call(PETR, "search", {"q": "реестр Pyrus"})
check("личная запись Ивана не утекла",
      all(x["zone_key"] != f"u:{IVAN}" for x in s4["results"]),
      str([x["zone_key"] for x in s4["results"]]))
g = call(PETR, "get_entry", {"entry_id": e1["entry_id"]})
check("прямой доступ к чужой личной записи закрыт",
      "__error__" in g and "недоступн" in g["__error__"])

print("\n== 10. Обратная связь двигает ранжирование ==")
shared_entry = in_shared[0]
u = call(PETR, "record_usage", {"version_id": shared_entry["version_id"],
                                "outcome": "helped", "context": "форма 1504224, сошлось"})
check("отметка записана", u.get("recorded") is True)
check("счётчик вырос", u["score"]["helped"] == 1, str(u.get("score")))

print("\n== 11. Связи и статистика ==")
lk = call(MARIA, "link_entries", {"from_entry_id": shared_entry["entry_id"],
                                  "to_entry_id": e1["entry_id"], "rel": "see_also"})
check("связь создана", lk.get("linked") is True)
st = call(IVAN, "stats")
check("статистика собирается", st["promotions"].get("approved") == 1, str(st["promotions"]))
check("честно сообщает, что эмбеддингов нет", st["embeddings_configured"] is False)

print(f"\n{'=' * 58}")
if failures:
    print(f"ПРОВАЛЕНО: {len(failures)}")
    for f in failures:
        print(f"  · {f}")
    sys.exit(1)
print("Все проверки пройдены.")
