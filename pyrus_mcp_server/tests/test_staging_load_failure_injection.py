import asyncio
import pytest
from unittest.mock import patch, AsyncMock
from pyrus_mcp.pyrus.client import pyrus_client
from pyrus_mcp.pyrus.exceptions import PyrusRateLimitError, PyrusAPIError

@pytest.mark.asyncio
async def test_concurrent_requests_simulation():
    """Тестирование параллельных асинхронных вызовов к клиенту."""
    with patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock) as mock_get_token, \
         patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        
        mock_get_token.return_value = "staging_token_123"
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"forms": [{"id": 1, "name": "Form 1"}]}
        mock_response.headers = {"Content-Length": "120"}
        mock_request.return_value = mock_response
        
        # Симулируем 20 одновременных запросов
        tasks = [pyrus_client.get("/forms") for _ in range(20)]
        results = await asyncio.gather(*tasks)
        
        assert len(results) == 20
        assert all("forms" in r for r in results)
        assert mock_request.call_count == 20

@pytest.mark.asyncio
async def test_failure_injection_transient_error_recovery():
    """Проверка восстановления после инъекции временного сбоя сети (503/429 -> 200)."""
    with patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock) as mock_get_token, \
         patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        
        mock_get_token.return_value = "staging_token_123"
        
        err_resp = AsyncMock()
        err_resp.status_code = 429
        
        ok_resp = AsyncMock()
        ok_resp.status_code = 200
        ok_resp.json.return_value = {"task": {"id": 999, "text": "Recovered"}}
        ok_resp.headers = {"Content-Length": "64"}
        
        # Сначала 429 (rate limit), со второй попытки 200 (успех)
        mock_request.side_effect = [err_resp, ok_resp]
        
        result = await pyrus_client.get("/tasks/999")
        assert result["task"]["id"] == 999
        assert mock_request.call_count == 2
