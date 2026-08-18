import httpx
import structlog
from typing import Any, Dict, Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from ..config import settings
from .auth import pyrus_auth
from .exceptions import PyrusAPIError, PyrusRateLimitError, PyrusSizeLimitError

logger = structlog.get_logger("pyrus_client")

MAX_RESPONSE_BYTES = 50 * 1024 * 1024  # 50 MB safety guard

class PyrusClient:
    """
    Centralized HTTP Client for communicating with Pyrus v4 API.
    Handles auth, retries, rate limits, and response parsing.
    """
    
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self._client.aclose()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException, PyrusRateLimitError)),
        reraise=True
    )
    async def request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """
        Executes a request to Pyrus API with circuit breaking and retries.
        """
        token = await pyrus_auth.get_token()
        
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        headers["User-Agent"] = "Pyrus-FastMCP-Server/0.1.0"
        
        url = f"{pyrus_auth.api_url.rstrip('/')}{endpoint}"
        
        logger.debug("Executing Pyrus API request", method=method, endpoint=endpoint)
        
        response = await self._client.request(method, url, headers=headers, **kwargs)
        
        if response.status_code == 429:
            logger.warning("Pyrus Rate Limit Hit", endpoint=endpoint)
            raise PyrusRateLimitError("Rate limit exceeded (429)")
            
        if response.status_code >= 400:
            logger.error("Pyrus API Error", status_code=response.status_code, text=response.text)
            raise PyrusAPIError(f"Pyrus API returned {response.status_code}: {response.text}")
            
        # Size guard check
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_RESPONSE_BYTES:
            raise PyrusSizeLimitError(f"Response size {content_length} exceeds limit of {MAX_RESPONSE_BYTES}")
            
        return response.json()

    # Convenience methods
    async def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("POST", endpoint, **kwargs)

    async def put(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("PUT", endpoint, **kwargs)

# Global client instance
pyrus_client = PyrusClient()
