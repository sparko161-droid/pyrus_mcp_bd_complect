import httpx
import structlog
import asyncio
import re
import json
from typing import Any, Dict
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .auth import iiko_auth
from .exceptions import IikoAPIError, IikoRateLimitError, IikoSizeLimitError

logger = structlog.get_logger("iiko_client")

MAX_RESPONSE_BYTES = 50 * 1024 * 1024  # 50 MB safety guard

_safe_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException, IikoRateLimitError)),
    reraise=True
)

_unsafe_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
    reraise=True
)

class IikoClient:
    """
    Centralized HTTP Client for communicating with iiko API.
    Handles auth, retries, rate limits, and response parsing.
    """
    
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self._client.aclose()

    async def _execute_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """
        Executes a request to iiko API with retries.
        """
        token = await iiko_auth.get_token()
        
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        
        url = f"{iiko_auth.api_url.rstrip('/')}{endpoint}"
        
        logger.debug("Executing iiko API request", method=method, endpoint=endpoint)
        
        async with self._client.stream(method, url, headers=headers, **kwargs) as response:
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                if retry_after:
                    try:
                        await asyncio.sleep(int(retry_after))
                    except ValueError:
                        logger.warning("Invalid Retry-After header", header=retry_after)
                logger.warning("iiko Rate Limit Hit", endpoint=endpoint)
                raise IikoRateLimitError("Rate limit exceeded (429)")
                
            if response.status_code >= 400:
                body_bytes = await response.aread()
                body_text = body_bytes.decode('utf-8', errors='replace')
                redacted = re.sub(r'([A-Za-z0-9_-]{20,})', '***', body_text)
                if len(redacted) > 200:
                    redacted = redacted[:197] + '...'
                logger.error("iiko API Error", status_code=response.status_code, text=redacted)
                raise IikoAPIError(f"iiko API returned {response.status_code}: {redacted}")
                
            content = bytearray()
            async for chunk in response.aiter_bytes():
                content.extend(chunk)
                if len(content) > MAX_RESPONSE_BYTES:
                    raise IikoSizeLimitError(f"Response size exceeds limit of {MAX_RESPONSE_BYTES}")
            
            if not content:
                return {}
            return json.loads(content)

    @_safe_retry
    async def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self._execute_request("GET", endpoint, **kwargs)

    @_safe_retry
    async def head(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self._execute_request("HEAD", endpoint, **kwargs)

    @_unsafe_retry
    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self._execute_request("POST", endpoint, **kwargs)

    @_unsafe_retry
    async def put(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self._execute_request("PUT", endpoint, **kwargs)

    @_unsafe_retry
    async def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self._execute_request("DELETE", endpoint, **kwargs)

iiko_client = IikoClient()
