import json
import structlog
from datetime import datetime, timezone
from typing import Optional, List
from .connection import get_connection

logger = structlog.get_logger("db.repositories")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ClientRepository:
    async def save(self, client) -> None:
        conn = await get_connection()
        await conn.execute(
            "INSERT OR REPLACE INTO clients (id, name, tenant_id, scopes, is_active, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                client.id,
                client.name,
                client.tenant_id,
                json.dumps(client.allowed_scopes),
                1 if client.is_active else 0,
                _utc_now(),
            ),
        )
        await conn.commit()

    async def get(self, client_id: str):
        conn = await get_connection()
        async with conn.execute(
            "SELECT * FROM clients WHERE id = ? AND is_active = 1", (client_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            from ..models.identity import Client
            return Client(
                id=row["id"],
                name=row["name"],
                tenant_id=row["tenant_id"],
                allowed_scopes=json.loads(row["scopes"]),
                is_active=bool(row["is_active"]),
            )


class TokenRepository:
    async def save(self, token) -> None:
        conn = await get_connection()
        await conn.execute(
            "INSERT OR REPLACE INTO tokens "
            "(token, client_id, tenant_id, scopes, expires_at, is_revoked, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                token.token,
                token.client_id,
                token.tenant_id,
                json.dumps(token.scopes),
                token.expires_at.isoformat(),
                1 if token.is_revoked else 0,
                _utc_now(),
            ),
        )
        await conn.commit()

    async def get(self, token_str: str):
        conn = await get_connection()
        async with conn.execute(
            "SELECT * FROM tokens WHERE token = ?", (token_str,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            from ..models.identity import Token
            from datetime import datetime
            return Token(
                token=row["token"],
                client_id=row["client_id"],
                tenant_id=row["tenant_id"],
                scopes=json.loads(row["scopes"]),
                expires_at=datetime.fromisoformat(row["expires_at"]),
                is_revoked=bool(row["is_revoked"]),
            )

    async def revoke(self, token_str: str) -> bool:
        conn = await get_connection()
        await conn.execute(
            "UPDATE tokens SET is_revoked = 1 WHERE token = ? AND is_revoked = 0",
            (token_str,),
        )
        await conn.commit()
        return conn.total_changes > 0


class AuditRepository:
    async def log(self, event: str, success: bool, correlation_id: str = "",
                  tenant_id: str = "", details: dict = None) -> None:
        conn = await get_connection()
        await conn.execute(
            "INSERT INTO audit_log (event, success, correlation_id, tenant_id, details, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                event,
                1 if success else 0,
                correlation_id,
                tenant_id,
                json.dumps(details or {}),
                _utc_now(),
            ),
        )
        await conn.commit()


class WebhookEventRepository:
    async def save_if_new(self, event_id: str, event_type: str, task_id: Optional[int],
                          payload: dict) -> bool:
        """Returns True if event was new, False if duplicate (idempotency check)."""
        conn = await get_connection()
        existing = await conn.execute(
            "SELECT event_id FROM webhook_events WHERE event_id = ?", (event_id,)
        )
        if await existing.fetchone():
            logger.info("Webhook event duplicate skipped", event_id=event_id)
            return False
        await conn.execute(
            "INSERT INTO webhook_events (event_id, event_type, task_id, payload, received_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (event_id, event_type, task_id, json.dumps(payload), _utc_now()),
        )
        await conn.commit()
        return True


# Singleton instances
client_repo = ClientRepository()
token_repo = TokenRepository()
audit_repo = AuditRepository()
webhook_event_repo = WebhookEventRepository()
