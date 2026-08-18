import hmac
import hashlib
import json
import uuid
import structlog
from starlette.requests import Request
from starlette.responses import JSONResponse
from .config import settings
from .db.repositories import webhook_event_repo

logger = structlog.get_logger("webhook_receiver")


async def webhook_handler(request: Request):
    """
    Receives events from Pyrus (e.g. task_created, comment_added),
    validates the HMAC signature, persists the event with idempotency check.
    """
    body = await request.body()
    signature = request.headers.get("x-pyrus-sig")

    if not signature:
        logger.warning("Webhook rejected: Missing signature")
        return JSONResponse({"error": "Missing signature"}, status_code=401)

    if not settings.pyrus_webhook_secret:
        logger.error("Webhook rejected: Server missing pyrus_webhook_secret")
        return JSONResponse({"error": "Server misconfigured"}, status_code=500)

    # Validate SHA1-HMAC signature
    secret = settings.pyrus_webhook_secret.encode("utf-8")
    expected_signature = hmac.new(secret, body, hashlib.sha1).hexdigest()

    if not hmac.compare_digest(expected_signature.lower(), signature.lower()):
        logger.warning("Webhook rejected: Invalid signature")
        return JSONResponse({"error": "Invalid signature"}, status_code=403)

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)

    event_type = payload.get("event")
    task_id = payload.get("task", {}).get("id") if payload.get("task") else None

    # Use Pyrus-provided idempotency key if present, otherwise generate one
    event_id = payload.get("event_id") or str(uuid.uuid4())

    # Persist with idempotency check (MCP-113)
    is_new = await webhook_event_repo.save_if_new(
        event_id=event_id,
        event_type=event_type,
        task_id=task_id,
        payload=payload,
    )

    if is_new:
        logger.info("Webhook event persisted", event=event_type, task_id=task_id, event_id=event_id)
    else:
        logger.info("Webhook event duplicate, skipped", event_id=event_id)

    return JSONResponse({"status": "ok"})
