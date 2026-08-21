import asyncio
import pytest
from unittest.mock import patch, AsyncMock
from pyrus_mcp.pyrus.client import pyrus_client
from pyrus_mcp.pyrus.exceptions import PyrusRateLimitError, PyrusAPIError

@pytest.mark.asyncio
async def test_concurrent_requests_simulation():
    """Тестирование параллельных асинхронных вызовов к клиенту."""
    with patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock) as mock_get_token, \
         patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
        
        mock_get_token.return_value = "staging_token_123"
        
        def make_mock_resp():
            resp = AsyncMock()
            resp.status_code = 200
            resp.headers = {"Content-Length": "40"}
            resp.aread = AsyncMock()
            async def aiter():
                yield b'{"forms": [{"id": 1, "name": "Form 1"}]}'
            resp.aiter_bytes = aiter
            return resp

        mock_send.side_effect = lambda *args, **kwargs: make_mock_resp()
        
        # Симулируем 20 одновременных запросов
        tasks = [pyrus_client.get("/forms") for _ in range(20)]
        results = await asyncio.gather(*tasks)
        
        assert len(results) == 20
        assert all("forms" in r for r in results)
        assert mock_send.call_count == 20

@pytest.mark.asyncio
async def test_failure_injection_transient_error_recovery():
    """Проверка восстановления после инъекции временного сбоя сети (503/429 -> 200)."""
    with patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock) as mock_get_token, \
         patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
        
        mock_get_token.return_value = "staging_token_123"
        
        err_resp = AsyncMock()
        err_resp.status_code = 429
        err_resp.aread = AsyncMock()
        
        ok_resp = AsyncMock()
        ok_resp.status_code = 200
        ok_resp.headers = {"Content-Length": "40"}
        ok_resp.aread = AsyncMock()
        async def aiter():
            yield b'{"task": {"id": 999, "text": "Recovered"}}'
        ok_resp.aiter_bytes = aiter
        
        # Сначала 429 (rate limit), со второй попытки 200 (успех)
        mock_send.side_effect = [err_resp, ok_resp]
        
        result = await pyrus_client.get("/tasks/999")
        assert result["task"]["id"] == 999
        assert mock_send.call_count == 2
