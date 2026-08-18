import pytest
import hmac
import hashlib
import json
from unittest.mock import AsyncMock
from starlette.requests import Request
from pyrus_mcp.webhooks import webhook_handler
from pyrus_mcp.config import settings

@pytest.mark.asyncio
async def test_webhook_handler_valid_signature():
    settings.pyrus_webhook_secret = "test_secret"
    payload = b'{"event": "task_created", "task": {"id": 123}}'
    
    # Generate valid signature
    secret = b"test_secret"
    signature = hmac.new(secret, payload, hashlib.sha1).hexdigest()
    
    mock_request = AsyncMock(spec=Request)
    mock_request.body.return_value = payload
    mock_request.headers = {"x-pyrus-sig": signature}
    
    response = await webhook_handler(mock_request)
    assert response.status_code == 200
    
    body = json.loads(response.body)
    assert body["status"] == "ok"

@pytest.mark.asyncio
async def test_webhook_handler_invalid_signature():
    settings.pyrus_webhook_secret = "test_secret"
    payload = b'{"event": "task_created", "task": {"id": 123}}'
    
    mock_request = AsyncMock(spec=Request)
    mock_request.body.return_value = payload
    mock_request.headers = {"x-pyrus-sig": "invalid_sig"}
    
    response = await webhook_handler(mock_request)
    assert response.status_code == 403
