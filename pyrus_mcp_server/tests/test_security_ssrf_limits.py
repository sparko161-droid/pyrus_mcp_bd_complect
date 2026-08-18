import pytest
from pyrus_mcp.pyrus.client import MAX_RESPONSE_BYTES
from pyrus_mcp.pyrus.exceptions import PyrusSizeLimitError
from pyrus_mcp.middleware import SecurityMiddleware

def test_max_response_bytes_configured():
    """Проверка, что лимит размера ответа установлен и защищает от перегрузки."""
    assert MAX_RESPONSE_BYTES == 50 * 1024 * 1024
    assert MAX_RESPONSE_BYTES > 0

def test_origin_allowed_check():
    """Проверка логики проверки Origin."""
    middleware = SecurityMiddleware(app=None)
    assert middleware.is_allowed_origin("http://localhost:3000") is True
    assert middleware.is_allowed_origin("https://app.pyrus.com") is True
