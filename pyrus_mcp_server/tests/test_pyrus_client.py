import pytest
from unittest.mock import patch, AsyncMock
from pyrus_mcp.pyrus.client import pyrus_client
from pyrus_mcp.pyrus.exceptions import PyrusAPIError, PyrusRateLimitError

@pytest.mark.asyncio
@patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock)
@patch("httpx.AsyncClient.request", new_callable=AsyncMock)
async def test_pyrus_client_success(mock_request, mock_get_token):
    mock_get_token.return_value = "fake_access_token"
    
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"tasks": []}
    mock_response.headers = {"Content-Length": "100"}
    mock_request.return_value = mock_response
    
    result = await pyrus_client.get("/tasks")
    assert result == {"tasks": []}
    mock_request.assert_called_once()
    
    # Check headers
    args, kwargs = mock_request.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer fake_access_token"

@pytest.mark.asyncio
@patch("pyrus_mcp.pyrus.client.pyrus_auth.get_token", new_callable=AsyncMock)
@patch("httpx.AsyncClient.request", new_callable=AsyncMock)
async def test_pyrus_client_rate_limit(mock_request, mock_get_token):
    mock_get_token.return_value = "fake_access_token"
    
    mock_response = AsyncMock()
    mock_response.status_code = 429
    mock_request.return_value = mock_response
    
    with pytest.raises(PyrusRateLimitError):
        # Because of @retry, this will be called 3 times before finally raising the error
        await pyrus_client.get("/tasks")
        
    assert mock_request.call_count == 3
