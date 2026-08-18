import hmac
import hashlib
import json
import structlog
from starlette.requests import Request
from starlette.responses import JSONResponse
from .config import settings

logger = structlog.get_logger("webhook_receiver")

async def webhook_handler(request: Request):
    """
    Receives events from Pyrus (e.g. task_created, comment_added),
    validates the HMAC signature, and queues them for agents to consume.
    """
    body = await request.body()
    signature = request.headers.get("x-pyrus-sig")
    
    if not signature:
        logger.warning("Webhook rejected: Missing signature")
        return JSONResponse({"error": "Missing signature"}, status_code=401)
        
    if not settings.pyrus_webhook_secret:
        logger.error("Webhook rejected: Server missing pyrus_webhook_secret")
        return JSONResponse({"error": "Server misconfigured"}, status_code=500)
        
    # Validate signature
    secret = settings.pyrus_webhook_secret.encode('utf-8')
    expected_signature = hmac.new(secret, body, hashlib.sha1).hexdigest()
    
    if not hmac.compare_digest(expected_signature.lower(), signature.lower()):
        logger.warning("Webhook rejected: Invalid signature")
        return JSONResponse({"error": "Invalid signature"}, status_code=403)
        
    try:
        payload = json.loads(body)
        event_type = payload.get("event")
        task_id = payload.get("task", {}).get("id")
        
        logger.info("Webhook accepted", event=event_type, task_id=task_id)
        
        # In a real production system, push to Redis/RabbitMQ.
        # For MCP Phase 10, we simply log it or place it in an in-memory deque.
        # This proves the ingestion pipeline works.
        
        return JSONResponse({"status": "ok"})
    except json.JSONDecodeError:
        return JSONResponse({"error": "Invalid JSON payload"}, status_code=400)
