#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Из inventory.json делает два человекочитаемых документа:

  TOOLS.md     — каталог всех инструментов с параметрами и пометками
  COVERAGE.md  — сверка с 59 методами Pyrus API v4: что закрыто, что нет,
                 и — самое интересное — какие инструменты НЕ ложатся ни на
                 один документированный метод (составные операции либо
                 недокументированные эндпоинты)

Запуск:  python3 make_report.py inventory.json --outdir .
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict

# ---------------------------------------------------------------- методы Pyrus API v4
# (раздел, verb, path, назначение) — тот же перечень, что в сравнении серверов
API: list[tuple[str, str, str, str]] = [
    ("Авторизация", "POST", "/auth", "Получение access_token"),
    ("Задачи", "GET", "/tasks/{id}", "Получить задачу со всеми комментариями"),
    ("Задачи", "POST", "/tasks", "Создать задачу"),
    ("Задачи", "POST", "/tasks/{id}/comments", "Комментарий — единственный способ изменить задачу"),
    ("Задачи", "DELETE", "/tasks/{id}", "Удалить задачу"),
    ("Формы", "GET", "/forms", "Список всех форм"),
    ("Формы", "GET", "/forms/{id}", "Описание формы"),
    ("Формы", "GET", "/forms/{id}/register", "Реестр задач по форме"),
    ("Формы", "GET", "/forms/{id}/permissions", "Права доступа к форме"),
    ("Формы", "POST", "/forms/{id}/permissions", "Изменить права доступа"),
    ("Справочники", "GET", "/catalogs", "Список всех справочников"),
    ("Справочники", "GET", "/catalogs/{id}", "Справочник со всеми элементами"),
    ("Справочники", "PUT", "/catalogs", "Создать справочник"),
    ("Справочники", "POST", "/catalogs/{id}", "Полная синхронизация"),
    ("Справочники", "POST", "/catalogs/{id}/diff", "Инкрементальное изменение"),
    ("Списки", "GET", "/lists", "Все списки"),
    ("Списки", "GET", "/lists/{id}", "Конкретный список"),
    ("Списки", "GET", "/lists/{id}/tasks", "Задачи из списка"),
    ("Списки", "POST", "/lists/{id}", "Изменить список"),
    ("Списки", "GET", "/inbox", "Входящие"),
    ("Файлы", "POST", "/files/upload", "Загрузить файл"),
    ("Файлы", "GET", "/files/download/{id}", "Скачать файл"),
    ("Участники", "GET", "/members", "Все участники"),
    ("Участники", "GET", "/members/{id}", "Сотрудник по ID"),
    ("Участники", "POST", "/members", "Добавить пользователя"),
    ("Участники", "PUT", "/members/{id}", "Изменить пользователя"),
    ("Участники", "DELETE", "/members/{id}", "Заблокировать пользователя"),
    ("Роли", "GET", "/roles", "Все роли"),
    ("Роли", "GET", "/roles/{id}", "Роль по ID"),
    ("Роли", "POST", "/roles", "Создать роль"),
    ("Роли", "PUT", "/roles/{id}", "Изменить роль"),
    ("Роли", "DELETE", "/roles/{id}", "Удалить роль"),
    ("Профиль", "GET", "/profile", "Профиль текущего пользователя"),
    ("Контакты", "GET", "/contacts", "Контакты по организациям"),
    ("Объявления", "GET", "/announcements", "Список объявлений"),
    ("Объявления", "GET", "/announcements/{id}", "Объявление по ID"),
    ("Объявления", "POST", "/announcements", "Создать объявление"),
    ("Объявления", "POST", "/announcements/{id}/comments", "Комментарий к объявлению"),
    ("Календарь", "GET", "/calendar", "Задачи и встречи за период"),
    ("База знаний", "GET", "/knowledgebase/{id}", "Статья или раздел"),
    ("База знаний", "PUT", "/knowledgebase/{id}", "Изменить статью"),
    ("База знаний", "POST", "/knowledgebase", "Создать статью"),
    ("База знаний", "GET", "/knowledgebase/structure", "Иерархия базы знаний"),
    ("База знаний", "GET", "/knowledgebase/{id}/permissions", "Права на статью"),
    ("База знаний", "PUT", "/knowledgebase/{id}/permissions", "Изменить права"),
    ("База знаний", "DELETE", "/knowledgebase/{id}", "Удалить статью"),
    ("Награды", "PUT", "/awards/{id}/threshold", "Пороги награды"),
    ("Награды", "GET", "/awards/{id}/threshold", "Текущие пороги"),
    ("Награды", "GET", "/members/{m}/awards/{a}/counter", "Счётчик награды"),
    ("Награды", "POST", "/members/{m}/awards/{a}/counter/increment", "Инкремент счётчика"),
    ("Награды", "PUT", "/members/{m}/awards/{a}/counter", "Установить счётчик"),
    ("Журнал событий", "GET", "/eventhistory", "CSV событий"),
    ("Журнал событий", "GET", "/fileaccesshistory", "CSV действий с файлами"),
    ("Журнал событий", "GET", "/taskaccesshistory", "CSV посещений задач"),
    ("Журнал событий", "GET", "/taskexporthistory", "CSV экспорта задач"),
    ("Журнал событий", "GET", "/registrydownloadhistory", "CSV скачивания реестров"),
    ("Телефония", "POST", "/integrations/call", "Регистрация звонка"),
    ("Телефония", "POST", "/integrations/attachcallrecord", "Прикрепить запись звонка"),
]

# Имя инструмента (или регулярка) → индексы методов API, которые он закрывает.
# Инструмент может закрывать несколько методов: comment_task в Pyrus — это и
# согласование, и смена полей, и вложения.
MAP: dict[str, list[str]] = {
    r"^get_tasks?$": ["GET /tasks/{id}"],
    r"^create_task$": ["POST /tasks"],
    r"^(comment_task|add_comment|update_task|update_task_fields|close_task|reopen_task|"
    r"attach_new_file_version|attach_files_to_field|approve_task|reject_task)$":
        ["POST /tasks/{id}/comments"],
    r"^delete_task$": ["DELETE /tasks/{id}"],
    r"^(get_forms|list_forms)$": ["GET /forms"],
    r"^get_form$": ["GET /forms/{id}"],
    r"^(get_registry|search_tasks|get_overdue_tasks|get_tasks_due_soon)$":
        ["GET /forms/{id}/register"],
    r"^get_form_permissions$": ["GET /forms/{id}/permissions"],
    r"^(set|update)_form_permissions$": ["POST /forms/{id}/permissions"],
    r"^(get_catalogs|list_catalogs)$": ["GET /catalogs"],
    r"^get_catalog$": ["GET /catalogs/{id}"],
    r"^create_catalog$": ["PUT /catalogs"],
    r"^sync_catalog$": ["POST /catalogs/{id}"],
    r"^(update_catalog_items|diff_catalog)$": ["POST /catalogs/{id}/diff"],
    r"^get_lists$": ["GET /lists"],
    r"^get_list$": ["GET /lists/{id}"],
    r"^(get_task_list|get_list_tasks)$": ["GET /lists/{id}/tasks"],
    r"^(update_list|create_list|delete_list|move_task)$": ["POST /lists/{id}"],
    r"^get_inbox$": ["GET /inbox"],
    r"^(get_upload_target|upload_file|upload_file_content)$": ["POST /files/upload"],
    r"^(get_file_download_url|download_file)$": ["GET /files/download/{id}"],
    r"^get_members$": ["GET /members"],
    r"^get_member$": ["GET /members/{id}"],
    r"^(add_member|create_member)$": ["POST /members"],
    r"^update_member$": ["PUT /members/{id}"],
    r"^(block_member|delete_member)$": ["DELETE /members/{id}"],
    r"^get_roles$": ["GET /roles"],
    r"^get_role$": ["GET /roles/{id}"],
    r"^create_role$": ["POST /roles"],
    r"^update_role$": ["PUT /roles/{id}"],
    r"^delete_role$": ["DELETE /roles/{id}"],
    r"^get_profile$": ["GET /profile"],
    r"^get_contacts$": ["GET /contacts"],
    r"^get_announcements$": ["GET /announcements"],
    r"^get_announcement$": ["GET /announcements/{id}"],
    r"^create_announcement$": ["POST /announcements"],
    r"^comment_announcement$": ["POST /announcements/{id}/comments"],
    r"^(get_calendar|get_meetings)$": ["GET /calendar"],
    r"^get_knowledge_base_entity$": ["GET /knowledgebase/{id}"],
    r"^update_knowledge_base_entity$": ["PUT /knowledgebase/{id}"],
    r"^create_knowledge_base_entity$": ["POST /knowledgebase"],
    r"^get_knowledge_base_structure$": ["GET /knowledgebase/structure"],
    r"^get_knowledge_base_permissions$": ["GET /knowledgebase/{id}/permissions"],
    r"^(set|update)_knowledge_base_permissions$": ["PUT /knowledgebase/{id}/permissions"],
    r"^delete_knowledge_base_entity$": ["DELETE /knowledgebase/{id}"],
    r"^register_call$": ["POST /integrations/call"],
    r"^attach_call_record$": ["POST /integrations/attachcallrecord"],
}


def map_tool(name: str) -> list[str]:
    for pattern, methods in MAP.items():
        if re.match(pattern, name or ""):
            return methods
    return []


def fmt_param(p: dict) -> str:
    bits = [f"`{p['name']}`", f"*{p['type']}*"]
    if p["required"]:
        bits.append("**обяз.**")
    if p.get("enum"):
        bits.append("= " + " / ".join(f"`{v}`" for v in p["enum"][:6]))
    elif p.get("default") is not None:
        bits.append(f"(по умолч. `{json.dumps(p['default'], ensure_ascii=False)}`)")
    line = " ".join(bits)
    if p.get("description"):
        line += f" — {p['description']}"
    return line


def write_tools_md(inv: dict, path: str) -> None:
    tools = inv.get("tools", [])
    si = inv.get("serverInfo", {})
    L = [
        f"# Инструменты MCP-сервера `{si.get('name', '?')}` {si.get('version', '')}".rstrip(),
        "",
        f"Адрес: `{inv.get('url')}`  ",
        f"Версия протокола: `{inv.get('protocolVersion')}`  ",
        f"Снято: {inv.get('collected_at')}  ",
        f"**Всего инструментов: {len(tools)}**",
        "",
    ]
    if inv.get("instructions"):
        L += ["> " + inv["instructions"].replace("\n", "\n> "), ""]

    # группировка по префиксу имени
    groups: dict[str, list[dict]] = defaultdict(list)
    for t in tools:
        n = t.get("name") or "?"
        for prefix, label in [
            ("task", "Задачи"), ("form", "Формы"), ("registry", "Реестры"),
            ("catalog", "Справочники"), ("list", "Списки"), ("file", "Файлы"),
            ("upload", "Файлы"), ("attach", "Файлы"), ("knowledge", "База знаний"),
            ("member", "Люди и роли"), ("role", "Люди и роли"),
            ("contact", "Люди и роли"), ("profile", "Люди и роли"),
            ("announcement", "Объявления"), ("inbox", "Входящие"),
            ("meeting", "Календарь"), ("calendar", "Календарь"), ("bot", "Боты"),
        ]:
            if prefix in n:
                groups[label].append(t)
                break
        else:
            groups["Прочее"].append(t)

    L += ["## Сводка", "", "| Группа | Инструментов |", "|---|--:|"]
    for g in sorted(groups, key=lambda k: -len(groups[k])):
        L.append(f"| {g} | {len(groups[g])} |")
    L.append("")

    for g in sorted(groups, key=lambda k: -len(groups[k])):
        L += [f"## {g}", ""]
        for t in sorted(groups[g], key=lambda x: x.get("name") or ""):
            ann = t.get("annotations") or {}
            marks = []
            if ann.get("readOnlyHint") is True:
                marks.append("`только чтение`")
            if ann.get("readOnlyHint") is False:
                marks.append("`пишет`")
            if ann.get("destructiveHint") is True:
                marks.append("`⚠ необратимо`")
            if ann.get("idempotentHint") is True:
                marks.append("`идемпотентно`")
            mapped = map_tool(t.get("name") or "")
            if mapped:
                marks.append("→ " + ", ".join(f"`{m}`" for m in mapped))
            else:
                marks.append("`⚠ не ложится на документированный метод API`")

            L += [f"### `{t.get('name')}`", ""]
            if t.get("description"):
                L += [t["description"], ""]
            L += [" · ".join(marks), ""]
            params = t.get("params") or []
            if params:
                L += ["Параметры:", ""]
                L += [f"- {fmt_param(p)}" for p in params]
                L.append("")
            else:
                L += ["_Без параметров._", ""]

    open(path, "w", encoding="utf-8").write("\n".join(L))


def write_coverage_md(inv: dict, path: str) -> dict:
    tools = inv.get("tools", [])
    covered: dict[str, list[str]] = defaultdict(list)
    unmapped: list[dict] = []
    for t in tools:
        name = t.get("name") or "?"
        methods = map_tool(name)
        if not methods:
            unmapped.append(t)
        for mth in methods:
            covered[mth].append(name)

    total = len(API)
    hit = sum(1 for _, v, p, _ in API if f"{v} {p}" in covered)

    L = [
        "# Сверка с Pyrus API v4",
        "",
        f"Инструментов на сервере: **{len(tools)}**  ",
        f"Методов API закрыто: **{hit} из {total}** ({round(hit / total * 100)}%)  ",
        f"Инструментов без соответствия документированному методу: **{len(unmapped)}**",
        "",
        "## Покрытие по методам",
        "",
        "| Метод | Назначение | Инструменты |",
        "|---|---|---|",
    ]
    for sec, verb, p, desc in API:
        key = f"{verb} {p}"
        names = covered.get(key)
        cell = ", ".join(f"`{n}`" for n in names) if names else "—"
        L.append(f"| `{verb} {p}` | {desc} | {cell} |")

    L += ["", "## Не покрыто", ""]
    gaps = [(s, v, p, d) for s, v, p, d in API if f"{v} {p}" not in covered]
    if gaps:
        bysec: dict[str, list[str]] = defaultdict(list)
        for s, v, p, _ in gaps:
            bysec[s].append(f"`{v} {p}`")
        for s, items in bysec.items():
            L.append(f"- **{s}** ({len(items)}): {', '.join(items)}")
    else:
        L.append("_Покрыто всё._")

    L += [
        "", "## Инструменты без соответствия методу API", "",
        "Это самое интересное в выгрузке. Каждый такой инструмент — либо составная",
        "операция поверх нескольких вызовов, либо недокументированный эндпоинт Pyrus,",
        "либо собственная логика сервера. Разбирайтесь с ними поимённо.", "",
    ]
    if unmapped:
        L += ["| Инструмент | Описание | Параметры |", "|---|---|---|"]
        for t in sorted(unmapped, key=lambda x: x.get("name") or ""):
            ps = ", ".join(f"`{p['name']}`" for p in (t.get("params") or [])[:8]) or "—"
            desc = (t.get("description") or "").replace("\n", " ").replace("|", "\\|")[:160]
            L.append(f"| `{t.get('name')}` | {desc} | {ps} |")
    else:
        L.append("_Все инструменты сопоставлены._")

    L += [
        "", "---", "",
        "Сопоставление имён с методами задано таблицей `MAP` в `make_report.py`.",
        "Если инструмент попал в «без соответствия» ошибочно — допишите правило туда.",
        "",
    ]
    open(path, "w", encoding="utf-8").write("\n".join(L))
    return {"tools": len(tools), "covered": hit, "total": total, "unmapped": len(unmapped)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inventory", nargs="?", default="inventory.json")
    ap.add_argument("--outdir", default=".")
    a = ap.parse_args()

    inv = json.load(open(a.inventory, encoding="utf-8"))
    write_tools_md(inv, f"{a.outdir}/TOOLS.md")
    st = write_coverage_md(inv, f"{a.outdir}/COVERAGE.md")

    print(f"TOOLS.md    — {st['tools']} инструментов")
    print(f"COVERAGE.md — {st['covered']}/{st['total']} методов API, "
          f"{st['unmapped']} инструментов без соответствия")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
