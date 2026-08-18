import aiosqlite
import structlog
from pathlib import Path
from typing import Optional

logger = structlog.get_logger("db.connection")

DB_PATH = Path(__file__).parent.parent.parent.parent.parent / "data" / "pyrus_mcp.db"

_connection: Optional[aiosqlite.Connection] = None


async def get_connection() -> aiosqlite.Connection:
    global _connection
    if _connection is None:
        raise RuntimeError("Database not initialized. Call open() first.")
    return _connection


async def open():
    global _connection
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _connection = await aiosqlite.connect(str(DB_PATH))
    _connection.row_factory = aiosqlite.Row
    # Enable WAL for better concurrent reads
    await _connection.execute("PRAGMA journal_mode=WAL")
    await _connection.execute("PRAGMA foreign_keys=ON")
    logger.info("Database connection opened", path=str(DB_PATH))


async def close():
    global _connection
    if _connection:
        await _connection.close()
        _connection = None
        logger.info("Database connection closed")
