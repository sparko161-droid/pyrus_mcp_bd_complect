import pytest
from unittest.mock import patch, AsyncMock
from pyrus_mcp.pyrus.client import pyrus_client
from pyrus_mcp.pyrus.exceptions import PyrusAPIError, PyrusRateLimitError

@pytest.mark.asyncio
@patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock)
@patch("httpx.AsyncClient.send", new_callable=AsyncMock)
async def test_pyrus_client_success(mock_send, mock_get_token):
    mock_get_token.return_value = "fake_access_token"
    
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.aread = AsyncMock()
    mock_response.headers = {"Content-Length": "15"}
    
    async def async_bytes():
        yield b'{"tasks": []}'
    mock_response.aiter_bytes = async_bytes
    
    mock_send.return_value = mock_response
    
    result = await pyrus_client.get("/tasks")
    assert result == {"tasks": []}
    mock_send.assert_called_once()

@pytest.mark.asyncio
@patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock)
@patch("httpx.AsyncClient.send", new_callable=AsyncMock)
async def test_pyrus_client_rate_limit(mock_send, mock_get_token):
    mock_get_token.return_value = "fake_access_token"
    
    mock_response = AsyncMock()
    mock_response.status_code = 429
    mock_response.aread = AsyncMock()
    mock_send.return_value = mock_response
    
    with pytest.raises(PyrusRateLimitError):
        await pyrus_client.get("/tasks")
        
    assert mock_send.call_count == 3
