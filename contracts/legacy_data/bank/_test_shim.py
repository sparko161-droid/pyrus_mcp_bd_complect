# -*- coding: utf-8 -*-
"""
ТЕСТОВАЯ ПРОСЛОЙКА. В продакшене не используется и не поставляется.

В песочнице, где это писалось, ни один драйвер Postgres не устанавливался
(индекс pip ограничен), а проверить настоящий код сервера по настоящей базе
было нужно. Прослойка подменяет psycopg минимальной реализацией поверх
командного psql: строит из параметризованного запроса литеральный SQL и
читает результат как JSON.

Ограничение, о котором надо помнить: каждый вызов psql — отдельная
транзакция, то есть автокоммит. Логику commit/rollback это не проверяет.
Всё остальное — SQL, схема, права, поиск, промоушен — проверяет по-настоящему.
"""

import json
import re
import subprocess
import sys
import types

PSQL = ["psql", "-h", "/tmp", "-p", "5433", "-U", "postgres", "-d", "bank",
        "-tAq", "-v", "ON_ERROR_STOP=1"]


class DbError(Exception):
    pass


class UniqueViolation(DbError):
    pass


def quote(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (list, tuple)):
        if not v:
            return "ARRAY[]::text[]"
        return "ARRAY[" + ",".join(quote(x) for x in v) + "]"
    s = str(v).replace("\\", "\\\\").replace("'", "''")
    return "E'" + s.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "'"


def render(sql: str, params) -> str:
    if params is None:
        return sql
    if isinstance(params, dict):
        def rep(m):
            return quote(params[m.group(1)])
        return re.sub(r"%\((\w+)\)s", rep, sql)
    out, it = [], iter(params)
    i = 0
    while i < len(sql):
        if sql[i:i + 2] == "%s":
            out.append(quote(next(it)))
            i += 2
        else:
            out.append(sql[i])
            i += 1
    return "".join(out)


def returns_rows(sql: str) -> bool:
    s = sql.strip().rstrip(";").lstrip().upper()
    return s.startswith(("SELECT", "WITH")) or " RETURNING " in s


def run(sql: str):
    q = sql.strip().rstrip(";")
    if not returns_rows(q):
        wrapped = q
    elif " RETURNING " in q.upper() and not q.lstrip().upper().startswith(("SELECT", "WITH")):
        # INSERT/UPDATE ... RETURNING нельзя положить в подзапрос —
        # только в CTE, изменяющий данные.
        wrapped = (f"WITH __w AS ({q}) "
                   f"SELECT coalesce(json_agg(row_to_json(__w)),'[]'::json) FROM __w")
    else:
        wrapped = (f"SELECT coalesce(json_agg(row_to_json(__t)),'[]'::json) "
                   f"FROM ({q}) __t")
    p = subprocess.run(PSQL + ["-c", wrapped], capture_output=True, text=True)
    if p.returncode != 0:
        err = p.stderr.strip()
        if "duplicate key" in err or "unique constraint" in err:
            raise UniqueViolation(err)
        raise DbError(err)
    if not returns_rows(q):
        return []
    out = p.stdout.strip()
    return json.loads(out) if out else []


class Cursor:
    def __init__(self):
        self._rows = []

    def execute(self, sql, params=None):
        self._rows = run(render(sql, params))
        return self

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Connection:
    def cursor(self, **kw):
        return Cursor()

    def commit(self):
        pass

    def rollback(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class ConnectionPool:
    def __init__(self, *a, **kw):
        pass

    def connection(self):
        return Connection()

    def close(self):
        pass


def install():
    """Подменить psycopg до импорта server.py."""
    errors = types.ModuleType("psycopg.errors")
    errors.UniqueViolation = UniqueViolation
    psycopg = types.ModuleType("psycopg")
    psycopg.errors = errors
    psycopg.Error = DbError

    rows = types.ModuleType("psycopg.rows")
    rows.dict_row = "dict_row"

    pool_mod = types.ModuleType("psycopg_pool")
    pool_mod.ConnectionPool = ConnectionPool

    sys.modules["psycopg"] = psycopg
    sys.modules["psycopg.errors"] = errors
    sys.modules["psycopg.rows"] = rows
    sys.modules["psycopg_pool"] = pool_mod
