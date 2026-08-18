#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MCP-сервер «Банк решений».

Транспорт — streamable-http, тот же, что у pyrus-mcp, чтобы подключался
одинаково. Личность вызывающего берётся из заголовков на каждом запросе и
нигде не хранится в сессии: так один и тот же токен сервера у разных людей
даёт разные права записи.

Заголовки:
    Authorization: Bearer <BANK_TOKEN>   — пускать ли на сервер вообще
    X-Bank-Actor: ivan@example.com       — от чьего имени работаем

Переменные окружения:
    DATABASE_URL     postgresql://...            (обязательно)
    BANK_TOKEN       общий токен доступа         (обязательно)
    EMBEDDING_URL    https://api.openai.com/v1/embeddings  (опционально)
    EMBEDDING_KEY    ключ к этому эндпоинту
    EMBEDDING_MODEL  text-embedding-3-small
    EMBEDDING_DIM    1536
    BANK_PORT        8080

Без EMBEDDING_URL сервер работает: поиск честно деградирует до
полнотекстового и сообщает об этом в поле `mode` ответа.
"""

from __future__ import annotations

import contextlib
import difflib
import hashlib
import json
import logging
import os
import re
from typing import Any, Callable

import httpx
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response
from starlette.routing import Route

PROTOCOL_VERSION = "2025-06-18"
SERVER_INFO = {"name": "solutions-bank", "version": "1.0.0"}
RRF_K = 60  # константа сглаживания в Reciprocal Rank Fusion

log = logging.getLogger("bank")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
BANK_TOKEN = os.environ.get("BANK_TOKEN", "")
EMBEDDING_URL = os.environ.get("EMBEDDING_URL", "")
EMBEDDING_KEY = os.environ.get("EMBEDDING_KEY", "")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "1536"))

pool: ConnectionPool | None = None

KINDS = ["solution", "function", "case", "client", "bot", "playbook", "note"]
RELS = ["supersedes", "depends_on", "variant_of", "derived_from", "see_also"]


class ToolError(Exception):
    """Ошибка, которую нужно показать модели как результат, а не как сбой."""


# ==================================================================== вспомогательное


def db():
    assert pool is not None, "пул не поднят"
    return pool.connection()


def content_hash(title: str, summary: str, body: str, payload: Any, tags: list) -> str:
    blob = json.dumps([title, summary, body, payload, sorted(tags)],
                      ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^\w\-]+", "-", s, flags=re.UNICODE)
    return re.sub(r"-{2,}", "-", s).strip("-")[:120] or "entry"


def embed(text: str) -> str | None:
    """Вектор в виде литерала pgvector. None — если провайдер не настроен."""
    if not EMBEDDING_URL or not text.strip():
        return None
    try:
        r = httpx.post(
            EMBEDDING_URL,
            headers={"Authorization": f"Bearer {EMBEDDING_KEY}"} if EMBEDDING_KEY else {},
            json={"model": EMBEDDING_MODEL, "input": text[:8000]},
            timeout=30.0,
        )
        r.raise_for_status()
        vec = r.json()["data"][0]["embedding"]
        if len(vec) != EMBEDDING_DIM:
            log.warning("модель вернула размерность %d, ожидалась %d — вектор пропущен",
                        len(vec), EMBEDDING_DIM)
            return None
        return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"
    except Exception as e:  # эмбеддинг не должен ронять запись
        log.warning("эмбеддинг не получен: %s", e)
        return None


def ensure_personal_zone(cur, actor: str) -> str:
    key = f"u:{actor}"
    cur.execute("SELECT id FROM zone WHERE key = %s", (key,))
    row = cur.fetchone()
    if row:
        return str(row["id"])
    cur.execute(
        "INSERT INTO zone (key, kind, title, owner) VALUES (%s,'personal',%s,%s) "
        "RETURNING id", (key, f"Личная зона {actor}", actor))
    return str(cur.fetchone()["id"])


def readable_zone_ids(cur, actor: str) -> list[str]:
    """Общая зона + личная + все команды, где актор состоит."""
    ensure_personal_zone(cur, actor)
    cur.execute(
        "SELECT id FROM zone WHERE kind = 'shared' OR owner = %s OR %s = ANY(members)",
        (actor, actor))
    return [str(r["id"]) for r in cur.fetchall()]


def zone_by_key(cur, key: str) -> dict | None:
    cur.execute("SELECT * FROM zone WHERE key = %s", (key,))
    return cur.fetchone()


def assert_can_write(zone: dict, actor: str) -> None:
    if zone["kind"] == "shared":
        raise ToolError(
            "В общую зону нельзя писать напрямую. Сохраните в свою зону, "
            "затем вызовите propose_promotion.")
    if zone["kind"] == "personal" and zone["owner"] != actor:
        raise ToolError(f"Это личная зона {zone['owner']}, писать в неё нельзя.")
    if zone["kind"] == "team" and actor not in (zone["members"] or []):
        raise ToolError(f"Вы не состоите в команде «{zone['title']}».")


def audit(cur, actor: str, action: str, entry_id=None, version_id=None, **detail) -> None:
    cur.execute(
        "INSERT INTO audit_log (actor, action, entry_id, version_id, detail) "
        "VALUES (%s,%s,%s,%s,%s)",
        (actor, action, entry_id, version_id, json.dumps(detail, ensure_ascii=False)))


# ==================================================================== инструменты

TOOLS: dict[str, dict] = {}


def tool(name: str, description: str, schema: dict, read_only: bool = True,
         destructive: bool = False):
    def deco(fn: Callable):
        TOOLS[name] = {
            "name": name,
            "description": description,
            "inputSchema": schema,
            "annotations": {"readOnlyHint": read_only, "destructiveHint": destructive},
            "fn": fn,
        }
        return fn
    return deco


S_STR = {"type": "string"}
S_INT = {"type": "integer"}


@tool("list_zones", "Доступные зоны: общая, ваша личная и команды, где вы состоите.",
      {"type": "object", "properties": {}})
def t_list_zones(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        ensure_personal_zone(cur, actor)
        cur.execute(
            "SELECT key, kind, title, owner, members, reviewers, "
            "       (SELECT count(*) FROM entry e WHERE e.zone_id = z.id "
            "        AND e.archived_at IS NULL) AS entries "
            "FROM zone z "
            "WHERE kind='shared' OR owner=%s OR %s = ANY(members) ORDER BY kind, key",
            (actor, actor))
        zones = cur.fetchall()
        c.commit()
    return {"zones": zones, "your_zone": f"u:{actor}"}


@tool("search",
      "Найти в банке. По умолчанию гибридный поиск: полнотекстовый плюс "
      "векторный, результаты сливаются по RRF. Ищет по общей зоне, вашей "
      "личной и вашим командам, если не указано иное.",
      {"type": "object", "properties": {
          "q": {**S_STR, "description": "Запрос на естественном языке"},
          "kinds": {"type": "array", "items": {**S_STR, "enum": KINDS},
                    "description": "Ограничить типами записей"},
          "zones": {"type": "array", "items": S_STR,
                    "description": "Ключи зон, например ['shared','u:ivan@x.ru']"},
          "tags": {"type": "array", "items": S_STR, "description": "Все теги должны присутствовать"},
          "mode": {**S_STR, "enum": ["hybrid", "text", "vector"], "default": "hybrid"},
          "limit": {**S_INT, "default": 10, "maximum": 50},
      }, "required": ["q"]})
def t_search(actor: str, a: dict) -> dict:
    q = (a.get("q") or "").strip()
    if not q:
        raise ToolError("Пустой запрос.")
    limit = min(int(a.get("limit", 10)), 50)
    mode = a.get("mode", "hybrid")

    with db() as c, c.cursor(row_factory=dict_row) as cur:
        if a.get("zones"):
            cur.execute("SELECT id, key FROM zone WHERE key = ANY(%s)", (a["zones"],))
            found = cur.fetchall()
            allowed = set(readable_zone_ids(cur, actor))
            zone_ids = [str(r["id"]) for r in found if str(r["id"]) in allowed]
            if not zone_ids:
                raise ToolError("Ни одна из указанных зон вам не доступна.")
        else:
            zone_ids = readable_zone_ids(cur, actor)

        qv = embed(q) if mode in ("hybrid", "vector") else None
        used = mode
        if mode == "vector" and qv is None:
            used = "text"
        elif mode == "hybrid" and qv is None:
            used = "text"

        params = {
            "q": q, "qv": qv, "zones": zone_ids,
            "kinds": a.get("kinds") or None, "tags": a.get("tags") or None,
            "lim": limit,
        }
        flt = ("ec.zone_id = ANY(%(zones)s::uuid[]) AND ec.archived_at IS NULL "
               "AND (%(kinds)s::text[] IS NULL OR ec.kind = ANY(%(kinds)s::text[])) "
               "AND (%(tags)s::text[] IS NULL OR ec.tags @> %(tags)s::text[])")

        # Запрос строим как ИЛИ по словам, а не И.
        # websearch_to_tsquery и plainto_tsquery склеивают слова через AND:
        # на вопросе в свободной форме («почему реестр теряет закрытые задачи»)
        # это почти всегда даёт ноль результатов. Заменяем & на | и полагаемся
        # на ts_rank_cd — он сам поднимает документы, где совпало больше слов.
        # Кавычки в запросе означают точную фразу, тогда работает websearch.
        tsq = ("websearch_to_tsquery('russian', %(q)s)" if '"' in q else
               "replace(plainto_tsquery('russian', %(q)s)::text, '&', '|')::tsquery")
        ft_cte = f"""
        ft AS (
          SELECT ec.entry_id, row_number() OVER (
                   ORDER BY ts_rank_cd(ev.tsv, {tsq}) DESC
                 ) AS rnk
          FROM entry_current ec JOIN entry_version ev ON ev.id = ec.version_id
          WHERE {flt} AND ev.tsv @@ {tsq}
          LIMIT 100)"""
        vec_cte = f"""
        vec AS (
          SELECT ec.entry_id, row_number() OVER (
                   ORDER BY ev.embedding <=> %(qv)s::vector
                 ) AS rnk
          FROM entry_current ec JOIN entry_version ev ON ev.id = ec.version_id
          WHERE {flt} AND %(qv)s IS NOT NULL AND ev.embedding IS NOT NULL
          LIMIT 100)"""

        if used == "text":
            ctes, join = ft_cte, "SELECT entry_id, 1.0/(%s + rnk) AS s FROM ft" % RRF_K
        elif used == "vector":
            ctes, join = vec_cte, "SELECT entry_id, 1.0/(%s + rnk) AS s FROM vec" % RRF_K
        else:
            ctes = ft_cte + "," + vec_cte
            join = (f"SELECT entry_id, 1.0/({RRF_K} + rnk) AS s FROM ft "
                    f"UNION ALL SELECT entry_id, 1.0/({RRF_K} + rnk) FROM vec")

        sql = f"""
        WITH {ctes}, fused AS (
          SELECT entry_id, sum(s) AS score FROM ({join}) u GROUP BY entry_id
        )
        SELECT ec.entry_id, ec.version_id, ec.version, ec.kind, ec.slug, ec.title,
               ec.summary, ec.tags, ec.author, ec.created_at, ec.zone_key,
               f.score::float8 AS base_score,
               sc.helped, sc.failed, sc.success_rate::float8,
               -- Полезность двигает выдачу, но не переворачивает её:
               -- множитель ограничен диапазоном примерно 0.85–1.15.
               (f.score * (0.85 + 0.3 * coalesce(sc.success_rate, 0.5)))::float8 AS score
        FROM fused f
        JOIN entry_current ec ON ec.entry_id = f.entry_id
        LEFT JOIN entry_score sc ON sc.entry_id = f.entry_id
        ORDER BY score DESC
        LIMIT %(lim)s"""
        cur.execute(sql, params)
        rows = cur.fetchall()
        c.commit()

    note = None
    if mode == "hybrid" and used == "text":
        note = ("Векторная часть не выполнялась: провайдер эмбеддингов не настроен "
                "(EMBEDDING_URL). Результат — только полнотекстовый поиск.")
    return {"mode": used, "count": len(rows), "results": rows, "note": note}


@tool("get_entry",
      "Запись целиком в текущей версии. Указывайте либо entry_id, либо тройку "
      "zone/kind/slug.",
      {"type": "object", "properties": {
          "entry_id": S_STR, "zone": S_STR,
          "kind": {**S_STR, "enum": KINDS}, "slug": S_STR,
          "with_links": {"type": "boolean", "default": True},
      }})
def t_get_entry(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        allowed = readable_zone_ids(cur, actor)
        if a.get("entry_id"):
            cur.execute("SELECT * FROM entry_current WHERE entry_id = %s", (a["entry_id"],))
        elif a.get("zone") and a.get("kind") and a.get("slug"):
            cur.execute(
                "SELECT ec.* FROM entry_current ec JOIN zone z ON z.id = ec.zone_id "
                "WHERE z.key=%s AND ec.kind=%s AND ec.slug=%s",
                (a["zone"], a["kind"], a["slug"]))
        else:
            raise ToolError("Нужен entry_id или тройка zone + kind + slug.")
        row = cur.fetchone()
        if not row:
            raise ToolError("Запись не найдена.")
        if str(row["zone_id"]) not in allowed:
            raise ToolError("Эта запись в недоступной вам зоне.")

        cur.execute("SELECT count(*) AS n FROM entry_version WHERE entry_id=%s",
                    (row["entry_id"],))
        row["versions_total"] = cur.fetchone()["n"]
        cur.execute("SELECT * FROM entry_score WHERE entry_id=%s", (row["entry_id"],))
        row["score"] = cur.fetchone()
        if a.get("with_links", True):
            cur.execute(
                "SELECT l.rel, l.note, l.to_entry_id, ec.title, ec.kind, ec.slug "
                "FROM entry_link l JOIN entry_current ec ON ec.entry_id = l.to_entry_id "
                "WHERE l.from_entry_id = %s", (row["entry_id"],))
            row["links"] = cur.fetchall()
        c.commit()
    return row


@tool("list_versions", "История версий записи: кто, когда и что менял.",
      {"type": "object", "properties": {"entry_id": S_STR, "limit": {**S_INT, "default": 30}},
       "required": ["entry_id"]})
def t_list_versions(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        allowed = readable_zone_ids(cur, actor)
        cur.execute("SELECT zone_id FROM entry WHERE id=%s", (a["entry_id"],))
        e = cur.fetchone()
        if not e or str(e["zone_id"]) not in allowed:
            raise ToolError("Запись не найдена или недоступна.")
        cur.execute(
            "SELECT id AS version_id, version, title, author, change_note, "
            "       created_at, content_hash, (embedding IS NOT NULL) AS has_embedding "
            "FROM entry_version WHERE entry_id=%s ORDER BY version DESC LIMIT %s",
            (a["entry_id"], int(a.get("limit", 30))))
        rows = cur.fetchall()
        c.commit()
    return {"entry_id": a["entry_id"], "versions": rows}


@tool("get_version", "Конкретная версия целиком.",
      {"type": "object", "properties": {"version_id": S_STR}, "required": ["version_id"]})
def t_get_version(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        allowed = readable_zone_ids(cur, actor)
        cur.execute(
            "SELECT ev.*, e.zone_id, e.kind, e.slug FROM entry_version ev "
            "JOIN entry e ON e.id = ev.entry_id WHERE ev.id=%s", (a["version_id"],))
        row = cur.fetchone()
        if not row or str(row["zone_id"]) not in allowed:
            raise ToolError("Версия не найдена или недоступна.")
        row.pop("tsv", None)
        row["embedding"] = "есть" if row.get("embedding") is not None else None
        c.commit()
    return row


@tool("diff_versions", "Построчный дифф двух версий: текст и ключи payload.",
      {"type": "object", "properties": {"from_version_id": S_STR, "to_version_id": S_STR},
       "required": ["from_version_id", "to_version_id"]})
def t_diff_versions(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        allowed = readable_zone_ids(cur, actor)
        cur.execute(
            "SELECT ev.id, ev.version, ev.title, ev.summary, ev.body, ev.payload, "
            "       ev.tags, e.zone_id FROM entry_version ev JOIN entry e ON e.id=ev.entry_id "
            "WHERE ev.id = ANY(%s::uuid[])",
            ([a["from_version_id"], a["to_version_id"]],))
        rows = {str(r["id"]): r for r in cur.fetchall()}
        c.commit()
    if len(rows) != 2:
        raise ToolError("Одна из версий не найдена.")
    old, new = rows.get(a["from_version_id"]), rows.get(a["to_version_id"])
    if not old or not new:
        raise ToolError("Одна из версий не найдена.")
    for r in (old, new):
        if str(r["zone_id"]) not in allowed:
            raise ToolError("Версия в недоступной зоне.")

    def block(r):
        return (f"# {r['title']}\n\n{r['summary']}\n\n{r['body']}").splitlines()

    text_diff = "\n".join(difflib.unified_diff(
        block(old), block(new),
        fromfile=f"v{old['version']}", tofile=f"v{new['version']}", lineterm=""))

    ko, kn = set((old["payload"] or {})), set((new["payload"] or {}))
    changed = [k for k in ko & kn if (old["payload"] or {})[k] != (new["payload"] or {})[k]]
    return {
        "from_version": old["version"], "to_version": new["version"],
        "text_diff": text_diff or "(текст не изменился)",
        "payload_added": sorted(kn - ko),
        "payload_removed": sorted(ko - kn),
        "payload_changed": sorted(changed),
        "tags_added": sorted(set(new["tags"]) - set(old["tags"])),
        "tags_removed": sorted(set(old["tags"]) - set(new["tags"])),
    }


@tool("put_entry",
      "Сохранить запись. Если такой slug в зоне уже есть — создаётся новая "
      "версия, старая остаётся неизменной. По умолчанию пишет в вашу личную "
      "зону. В общую зону напрямую писать нельзя, только через промоушен.",
      {"type": "object", "properties": {
          "kind": {**S_STR, "enum": KINDS},
          "title": S_STR,
          "summary": {**S_STR, "description": "1–3 предложения: что это и когда применять"},
          "body": {**S_STR, "description": "Markdown: подробности, код, разбор"},
          "payload": {"type": "object", "description": "Машинная часть: конфиг, параметры"},
          "tags": {"type": "array", "items": S_STR},
          "slug": {**S_STR, "description": "Если не задан — выводится из заголовка"},
          "zone": {**S_STR, "description": "Ключ зоны; по умолчанию ваша личная"},
          "change_note": S_STR,
      }, "required": ["kind", "title"]},
      read_only=False)
def t_put_entry(actor: str, a: dict) -> dict:
    kind = a["kind"]
    if kind not in KINDS:
        raise ToolError(f"Неизвестный kind. Допустимые: {', '.join(KINDS)}")
    title = (a.get("title") or "").strip()
    if not title:
        raise ToolError("Пустой заголовок.")
    summary = (a.get("summary") or "").strip()
    body = a.get("body") or ""
    payload = a.get("payload") or {}
    tags = sorted({t.strip().lower() for t in (a.get("tags") or []) if t.strip()})
    slug = slugify(a.get("slug") or title)

    with db() as c, c.cursor(row_factory=dict_row) as cur:
        if a.get("zone"):
            zone = zone_by_key(cur, a["zone"])
            if not zone:
                raise ToolError(f"Зона {a['zone']} не найдена.")
        else:
            zid = ensure_personal_zone(cur, actor)
            cur.execute("SELECT * FROM zone WHERE id=%s", (zid,))
            zone = cur.fetchone()
        assert_can_write(zone, actor)

        cur.execute("SELECT id FROM entry WHERE zone_id=%s AND kind=%s AND slug=%s",
                    (zone["id"], kind, slug))
        row = cur.fetchone()
        if row:
            entry_id, created = str(row["id"]), False
        else:
            cur.execute(
                "INSERT INTO entry (zone_id, kind, slug, created_by) "
                "VALUES (%s,%s,%s,%s) RETURNING id", (zone["id"], kind, slug, actor))
            entry_id, created = str(cur.fetchone()["id"]), True

        h = content_hash(title, summary, body, payload, tags)
        cur.execute(
            "SELECT id, version FROM entry_version WHERE entry_id=%s "
            "ORDER BY version DESC LIMIT 1", (entry_id,))
        prev = cur.fetchone()
        if prev and prev["version"] is not None:
            cur.execute("SELECT content_hash FROM entry_version WHERE id=%s", (prev["id"],))
            if cur.fetchone()["content_hash"] == h:
                c.commit()
                return {"entry_id": entry_id, "version": prev["version"],
                        "version_id": str(prev["id"]), "created": False,
                        "unchanged": True,
                        "note": "Содержимое не изменилось — новая версия не создавалась."}
        next_ver = (prev["version"] + 1) if prev else 1

        vec = embed("\n".join([title, summary, body[:4000], " ".join(tags)]))
        cur.execute(
            "INSERT INTO entry_version (entry_id, version, title, summary, body, payload, "
            " tags, tags_text, author, change_note, parent_version_id, content_hash, embedding) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector) RETURNING id",
            (entry_id, next_ver, title, summary, body, json.dumps(payload, ensure_ascii=False),
             tags, " ".join(tags), actor, a.get("change_note") or "",
             prev["id"] if prev else None, h, vec))
        version_id = str(cur.fetchone()["id"])
        cur.execute("UPDATE entry SET updated_at = now() WHERE id=%s", (entry_id,))
        audit(cur, actor, "put_entry", entry_id, version_id,
              zone=zone["key"], kind=kind, slug=slug, version=next_ver)
        c.commit()

    return {"entry_id": entry_id, "version_id": version_id, "version": next_ver,
            "zone": zone["key"], "kind": kind, "slug": slug,
            "created": created, "unchanged": False,
            "embedded": vec is not None}


@tool("archive_entry", "Убрать запись из выдачи. Версии сохраняются, это не удаление.",
      {"type": "object", "properties": {"entry_id": S_STR, "reason": S_STR},
       "required": ["entry_id"]}, read_only=False)
def t_archive(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT z.kind, z.owner, z.members, z.title FROM entry e "
            "JOIN zone z ON z.id = e.zone_id WHERE e.id=%s", (a["entry_id"],))
        zone = cur.fetchone()
        if not zone:
            raise ToolError("Запись не найдена.")
        assert_can_write(zone, actor)
        cur.execute("UPDATE entry SET archived_at = now() WHERE id=%s", (a["entry_id"],))
        audit(cur, actor, "archive_entry", a["entry_id"], reason=a.get("reason", ""))
        c.commit()
    return {"entry_id": a["entry_id"], "archived": True}


@tool("link_entries", "Связать две записи: supersedes, depends_on, variant_of, "
                      "derived_from, see_also.",
      {"type": "object", "properties": {
          "from_entry_id": S_STR, "to_entry_id": S_STR,
          "rel": {**S_STR, "enum": RELS}, "note": S_STR},
       "required": ["from_entry_id", "to_entry_id", "rel"]}, read_only=False)
def t_link(actor: str, a: dict) -> dict:
    if a["rel"] not in RELS:
        raise ToolError(f"Допустимые связи: {', '.join(RELS)}")
    if a["from_entry_id"] == a["to_entry_id"]:
        raise ToolError("Нельзя связать запись саму с собой.")
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "INSERT INTO entry_link (from_entry_id, to_entry_id, rel, note, created_by) "
            "VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (a["from_entry_id"], a["to_entry_id"], a["rel"], a.get("note", ""), actor))
        audit(cur, actor, "link_entries", a["from_entry_id"], rel=a["rel"],
              to=a["to_entry_id"])
        c.commit()
    return {"linked": True, **{k: a[k] for k in ("from_entry_id", "to_entry_id", "rel")}}


@tool("propose_promotion",
      "Предложить версию в общий банк. Заявку разбирает ревьюер зоны; до "
      "одобрения в общей зоне ничего не появляется.",
      {"type": "object", "properties": {
          "version_id": S_STR,
          "target_zone": {**S_STR, "default": "shared"},
          "target_slug": {**S_STR, "description": "Если не задан — берётся исходный"},
          "rationale": {**S_STR, "description": "Чем это полезно остальным"}},
       "required": ["version_id"]}, read_only=False)
def t_propose(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT ev.id, ev.version, ev.title, e.id AS entry_id, e.slug, e.kind, "
            "       e.zone_id FROM entry_version ev JOIN entry e ON e.id=ev.entry_id "
            "WHERE ev.id=%s", (a["version_id"],))
        v = cur.fetchone()
        if not v:
            raise ToolError("Версия не найдена.")
        if str(v["zone_id"]) not in readable_zone_ids(cur, actor):
            raise ToolError("Эта версия вам недоступна.")

        tz = zone_by_key(cur, a.get("target_zone") or "shared")
        if not tz:
            raise ToolError("Целевая зона не найдена.")
        if str(tz["id"]) == str(v["zone_id"]):
            raise ToolError("Версия уже в этой зоне.")

        slug = slugify(a.get("target_slug") or v["slug"])
        try:
            cur.execute(
                "INSERT INTO promotion (source_version_id, target_zone_id, target_slug, "
                " rationale, requested_by) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (v["id"], tz["id"], slug, a.get("rationale", ""), actor))
        except psycopg.errors.UniqueViolation:
            c.rollback()
            raise ToolError("По этой версии уже открыта заявка.")
        pid = str(cur.fetchone()["id"])
        audit(cur, actor, "propose_promotion", v["entry_id"], v["id"],
              promotion=pid, target=tz["key"])
        c.commit()
    return {"promotion_id": pid, "state": "pending", "target_zone": tz["key"],
            "target_slug": slug, "title": v["title"],
            "reviewers": tz["reviewers"] or ["(ревьюеры не назначены — задайте их в zone.reviewers)"]}


@tool("list_promotions", "Заявки на промоушен. По умолчанию — открытые.",
      {"type": "object", "properties": {
          "state": {**S_STR, "enum": ["pending", "approved", "rejected", "withdrawn"],
                    "default": "pending"},
          "mine": {"type": "boolean", "default": False,
                   "description": "Только мои заявки"},
          "limit": {**S_INT, "default": 30}}})
def t_list_promotions(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT p.id, p.state, p.target_slug, p.rationale, p.requested_by, "
            "       p.created_at, p.reviewer, p.reviewed_at, p.review_note, "
            "       tz.key AS target_zone, ev.title, ev.summary, ev.version, "
            "       ev.id AS source_version_id, sz.key AS source_zone, e.kind, "
            "       (%s = ANY(tz.reviewers)) AS you_can_review "
            "FROM promotion p "
            "JOIN zone tz ON tz.id = p.target_zone_id "
            "JOIN entry_version ev ON ev.id = p.source_version_id "
            "JOIN entry e ON e.id = ev.entry_id "
            "JOIN zone sz ON sz.id = e.zone_id "
            "WHERE p.state = %s AND (NOT %s OR p.requested_by = %s) "
            "ORDER BY p.created_at DESC LIMIT %s",
            (actor, a.get("state", "pending"), bool(a.get("mine")), actor,
             int(a.get("limit", 30))))
        rows = cur.fetchall()
        c.commit()
    return {"count": len(rows), "promotions": rows}


@tool("review_promotion",
      "Одобрить или отклонить заявку. При одобрении содержимое версии "
      "копируется в целевую зону новой записью или новой версией существующей; "
      "исходная запись автора остаётся нетронутой.",
      {"type": "object", "properties": {
          "promotion_id": S_STR,
          "decision": {**S_STR, "enum": ["approve", "reject", "withdraw"]},
          "note": S_STR}, "required": ["promotion_id", "decision"]}, read_only=False)
def t_review(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT p.*, tz.key AS tz_key, tz.reviewers, tz.kind AS tz_kind "
            "FROM promotion p JOIN zone tz ON tz.id = p.target_zone_id WHERE p.id=%s",
            (a["promotion_id"],))
        p = cur.fetchone()
        if not p:
            raise ToolError("Заявка не найдена.")
        if p["state"] != "pending":
            raise ToolError(f"Заявка уже в состоянии «{p['state']}».")

        decision = a["decision"]
        if decision == "withdraw":
            if p["requested_by"] != actor:
                raise ToolError("Отозвать заявку может только её автор.")
            cur.execute("UPDATE promotion SET state='withdrawn', reviewer=%s, "
                        "reviewed_at=now(), review_note=%s WHERE id=%s",
                        (actor, a.get("note", ""), p["id"]))
            c.commit()
            return {"promotion_id": str(p["id"]), "state": "withdrawn"}

        if actor not in (p["reviewers"] or []):
            raise ToolError(
                f"Вы не ревьюер зоны «{p['tz_key']}». "
                f"Ревьюеры: {', '.join(p['reviewers'] or []) or 'не назначены'}.")

        if decision == "reject":
            cur.execute("UPDATE promotion SET state='rejected', reviewer=%s, "
                        "reviewed_at=now(), review_note=%s WHERE id=%s",
                        (actor, a.get("note", ""), p["id"]))
            audit(cur, actor, "reject_promotion", None, p["source_version_id"],
                  promotion=str(p["id"]))
            c.commit()
            return {"promotion_id": str(p["id"]), "state": "rejected"}

        # -------- одобрение: копируем содержимое в целевую зону
        cur.execute(
            "SELECT ev.*, e.kind, e.id AS src_entry_id FROM entry_version ev "
            "JOIN entry e ON e.id = ev.entry_id WHERE ev.id=%s", (p["source_version_id"],))
        v = cur.fetchone()

        cur.execute("SELECT id FROM entry WHERE zone_id=%s AND kind=%s AND slug=%s",
                    (p["target_zone_id"], v["kind"], p["target_slug"]))
        tgt = cur.fetchone()
        if tgt:
            target_entry = str(tgt["id"])
        else:
            cur.execute(
                "INSERT INTO entry (zone_id, kind, slug, created_by, origin_entry_id) "
                "VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (p["target_zone_id"], v["kind"], p["target_slug"],
                 p["requested_by"], v["src_entry_id"]))
            target_entry = str(cur.fetchone()["id"])

        cur.execute("SELECT id, version FROM entry_version WHERE entry_id=%s "
                    "ORDER BY version DESC LIMIT 1", (target_entry,))
        prev = cur.fetchone()
        nxt = (prev["version"] + 1) if prev else 1

        cur.execute(
            "INSERT INTO entry_version (entry_id, version, title, summary, body, payload, "
            " tags, tags_text, author, change_note, parent_version_id, content_hash, embedding) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector) RETURNING id",
            (target_entry, nxt, v["title"], v["summary"], v["body"],
             json.dumps(v["payload"], ensure_ascii=False), v["tags"],
             " ".join(v["tags"] or []), v["author"],
             f"Промоушен из {v['version']}-й версии личной записи, одобрил {actor}. "
             f"{a.get('note','')}".strip(),
             prev["id"] if prev else None, v["content_hash"], v["embedding"]))
        new_vid = str(cur.fetchone()["id"])

        cur.execute("UPDATE promotion SET state='approved', reviewer=%s, reviewed_at=now(), "
                    "review_note=%s, result_entry_id=%s WHERE id=%s",
                    (actor, a.get("note", ""), target_entry, p["id"]))
        cur.execute(
            "INSERT INTO entry_link (from_entry_id, to_entry_id, rel, note, created_by) "
            "VALUES (%s,%s,'derived_from','промоушен',%s) ON CONFLICT DO NOTHING",
            (target_entry, v["src_entry_id"], actor))
        audit(cur, actor, "approve_promotion", target_entry, new_vid,
              promotion=str(p["id"]))
        c.commit()

    return {"promotion_id": str(p["id"]), "state": "approved",
            "target_zone": p["tz_key"], "entry_id": target_entry,
            "version_id": new_vid, "version": nxt}


@tool("record_usage",
      "Отметить, помогло решение или нет. Это единственный сигнал качества в "
      "банке, и он двигает ранжирование — отмечайтесь.",
      {"type": "object", "properties": {
          "version_id": S_STR,
          "outcome": {**S_STR, "enum": ["helped", "partial", "failed"]},
          "context": {**S_STR, "description": "Одна строка: где применяли и что вышло"}},
       "required": ["version_id", "outcome"]}, read_only=False)
def t_usage(actor: str, a: dict) -> dict:
    if a["outcome"] not in ("helped", "partial", "failed"):
        raise ToolError("outcome: helped, partial или failed.")
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT entry_id FROM entry_version WHERE id=%s", (a["version_id"],))
        v = cur.fetchone()
        if not v:
            raise ToolError("Версия не найдена.")
        cur.execute(
            "INSERT INTO usage_event (version_id, actor, outcome, context) "
            "VALUES (%s,%s,%s,%s)",
            (a["version_id"], actor, a["outcome"], a.get("context", "")))
        cur.execute("SELECT * FROM entry_score WHERE entry_id=%s", (v["entry_id"],))
        score = cur.fetchone()
        c.commit()
    return {"recorded": True, "entry_id": str(v["entry_id"]), "score": score}


@tool("stats", "Что вообще есть в банке: по зонам, типам и активности.",
      {"type": "object", "properties": {}})
def t_stats(actor: str, a: dict) -> dict:
    with db() as c, c.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT z.key AS zone, e.kind, count(*) AS entries, "
            "       sum((SELECT count(*) FROM entry_version v WHERE v.entry_id=e.id)) AS versions "
            "FROM entry e JOIN zone z ON z.id=e.zone_id "
            "WHERE e.archived_at IS NULL GROUP BY 1,2 ORDER BY 1,2")
        by_zone = cur.fetchall()
        cur.execute("SELECT count(*) AS n FROM entry_version WHERE embedding IS NULL")
        no_vec = cur.fetchone()["n"]
        cur.execute("SELECT state, count(*) AS n FROM promotion GROUP BY 1")
        promos = {r["state"]: r["n"] for r in cur.fetchall()}
        cur.execute("SELECT outcome, count(*) AS n FROM usage_event GROUP BY 1")
        usage = {r["outcome"]: r["n"] for r in cur.fetchall()}
        c.commit()
    return {"by_zone": by_zone, "versions_without_embedding": no_vec,
            "promotions": promos, "usage": usage,
            "embeddings_configured": bool(EMBEDDING_URL)}


# ==================================================================== транспорт MCP


def rpc_result(rid, result):
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def rpc_error(rid, code, message):
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


async def mcp_endpoint(request: Request) -> Response:
    auth = request.headers.get("authorization", "")
    if not BANK_TOKEN or auth != f"Bearer {BANK_TOKEN}":
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    # Закрытие сессии. Состояния между запросами мы не держим — личность
    # приходит заголовком каждый раз, — так что закрывать нечего.
    if request.method == "DELETE":
        return Response(status_code=204)

    try:
        req = await request.json()
    except Exception:
        return JSONResponse(rpc_error(None, -32700, "parse error"), status_code=400)

    rid, method = req.get("id"), req.get("method")
    if rid is None:  # нотификация
        return Response(status_code=202)

    if method == "initialize":
        return JSONResponse(rpc_result(rid, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": (
                "Банк решений: версионное хранилище. Каждый пишет в свою зону "
                "(put_entry), в общую попадает через propose_promotion и ревью. "
                "Прежде чем решать задачу заново — поищите (search). Применили "
                "чужое решение — отметьте record_usage, это двигает ранжирование."),
        }))

    if method == "tools/list":
        return JSONResponse(rpc_result(rid, {"tools": [
            {k: t[k] for k in ("name", "description", "inputSchema", "annotations")}
            for t in TOOLS.values()]}))

    if method in ("resources/list", "prompts/list"):
        key = "resources" if method.startswith("resources") else "prompts"
        return JSONResponse(rpc_result(rid, {key: []}))

    if method == "tools/call":
        params = req.get("params") or {}
        name = params.get("name")
        spec = TOOLS.get(name)
        if not spec:
            return JSONResponse(rpc_error(rid, -32602, f"нет такого инструмента: {name}"))

        actor = (request.headers.get("x-bank-actor") or "").strip().lower()
        if not actor:
            return JSONResponse(rpc_result(rid, {
                "isError": True,
                "content": [{"type": "text", "text":
                             "Не передан заголовок X-Bank-Actor — непонятно, от чьего "
                             "имени работать и в чью зону писать."}]}))
        try:
            out = spec["fn"](actor, params.get("arguments") or {})
            text = json.dumps(out, ensure_ascii=False, indent=2, default=str)
            return JSONResponse(rpc_result(rid, {
                "content": [{"type": "text", "text": text}],
                "structuredContent": json.loads(json.dumps(out, default=str)),
            }))
        except ToolError as e:
            return JSONResponse(rpc_result(rid, {
                "isError": True, "content": [{"type": "text", "text": str(e)}]}))
        except Exception as e:
            log.exception("инструмент %s упал", name)
            return JSONResponse(rpc_result(rid, {
                "isError": True,
                "content": [{"type": "text",
                             "text": f"Внутренняя ошибка в {name}: {type(e).__name__}: {e}"}]}))

    return JSONResponse(rpc_error(rid, -32601, f"method not found: {method}"))


async def health(request: Request) -> Response:
    try:
        with db() as c, c.cursor() as cur:
            cur.execute("SELECT 1")
        return PlainTextResponse("ok")
    except Exception as e:
        return PlainTextResponse(f"db down: {e}", status_code=503)


def startup() -> None:
    global pool
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if not DATABASE_URL:
        raise SystemExit("Не задан DATABASE_URL")
    if not BANK_TOKEN:
        raise SystemExit("Не задан BANK_TOKEN")
    pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=True,
                          kwargs={"row_factory": dict_row})
    log.info("банк поднят, инструментов: %d, эмбеддинги: %s",
             len(TOOLS), "да" if EMBEDDING_URL else "нет (только полнотекстовый поиск)")


def shutdown() -> None:
    if pool:
        pool.close()


@contextlib.asynccontextmanager
async def lifespan(_app):
    startup()
    try:
        yield
    finally:
        shutdown()


app = Starlette(
    routes=[Route("/mcp", mcp_endpoint, methods=["POST", "DELETE"]),
            Route("/health", health, methods=["GET"])],
    lifespan=lifespan,
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("BANK_PORT", "8080")))
