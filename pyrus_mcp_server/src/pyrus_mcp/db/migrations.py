import structlog
from .connection import get_connection

logger = structlog.get_logger("db.migrations")

MIGRATIONS = [
    # Migration 001: Core identity tables
    """
    CREATE TABLE IF NOT EXISTS clients (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        tenant_id   TEXT NOT NULL,
        scopes      TEXT NOT NULL,   -- JSON array string
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
    );
    """,
    # Migration 002: Token lifecycle table
    """
    CREATE TABLE IF NOT EXISTS tokens (
        token       TEXT PRIMARY KEY,
        client_id   TEXT NOT NULL REFERENCES clients(id),
        tenant_id   TEXT NOT NULL,
        scopes      TEXT NOT NULL,   -- JSON array string
        expires_at  TEXT NOT NULL,
        is_revoked  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
    );
    """,
    # Migration 003: Audit log
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        event           TEXT NOT NULL,
        success         INTEGER NOT NULL,
        correlation_id  TEXT,
        tenant_id       TEXT,
        details         TEXT,        -- JSON
        created_at      TEXT NOT NULL
    );
    """,
    # Migration 004: Webhook events with idempotency key
    """
    CREATE TABLE IF NOT EXISTS webhook_events (
        event_id    TEXT PRIMARY KEY,  -- Pyrus-provided idempotency key
        event_type  TEXT,
        task_id     INTEGER,
        payload     TEXT NOT NULL,     -- Full JSON payload
        received_at TEXT NOT NULL,
        processed   INTEGER NOT NULL DEFAULT 0
    );
    """,
]


async def run_migrations():
    """Applies all migrations idempotently on server startup."""
    conn = await get_connection()
    for i, sql in enumerate(MIGRATIONS, start=1):
        try:
            await conn.execute(sql)
            await conn.commit()
            logger.debug(f"Migration {i:03d} applied")
        except Exception as e:
            logger.error(f"Migration {i:03d} failed", error=str(e))
            raise
    logger.info("All database migrations applied successfully", count=len(MIGRATIONS))
