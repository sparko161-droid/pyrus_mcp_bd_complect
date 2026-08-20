import httpx
import structlog
import json
from typing import Any, Dict, Optional
from tenacity import AsyncRetrying, stop_after_attempt, wait_exponential, retry_if_exception_type

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

    async def request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """
        Executes a request to Pyrus API with circuit breaking and retries.
        """
        token = await pyrus_auth.get_token()
        
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        headers["User-Agent"] = "Pyrus-FastMCP-Server/0.1.0"
        
        url = f"{pyrus_auth.api_url.rstrip('/')}{endpoint}"
        
        safe_methods = {'GET', 'HEAD', 'OPTIONS'}
        is_safe = method.upper() in safe_methods
        
        retry_exceptions = (httpx.NetworkError, httpx.TimeoutException)
        if is_safe:
            retry_exceptions += (PyrusRateLimitError,)
            
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type(retry_exceptions),
            reraise=True
        ):
            with attempt:
                try:
                    logger.debug("Executing Pyrus API request", method=method, endpoint=endpoint)
                    
                    req = self._client.build_request(method, url, headers=headers, **kwargs)
                    response = await self._client.send(req, stream=True)
                    
                    if response.status_code == 429:
                        logger.warning("Pyrus Rate Limit Hit", endpoint=endpoint)
                        raise PyrusRateLimitError("Rate limit exceeded (429)")
                        
                    if response.status_code >= 400:
                        await response.aread()
                        error_body = response.text[:200].replace('\n', ' ')
                        logger.error("Pyrus API Error", status_code=response.status_code, text=error_body)
                        raise PyrusAPIError(f"Pyrus API returned {response.status_code}: {error_body}")
                        
                    content_length = response.headers.get("Content-Length")
                    if content_length and int(content_length) > MAX_RESPONSE_BYTES:
                        raise PyrusSizeLimitError(f"Response size {content_length} exceeds limit of {MAX_RESPONSE_BYTES}")
                        
                    size = 0
                    chunks = []
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_RESPONSE_BYTES:
                            raise PyrusSizeLimitError(f"Response size exceeds limit of {MAX_RESPONSE_BYTES}")
                        chunks.append(chunk)
                        
                    body = b"".join(chunks)
                    if body:
                        return json.loads(body)
                    return {}
                except Exception as e:
                    if not is_safe and isinstance(e, (httpx.NetworkError, httpx.TimeoutException)):
                        logger.warning("Retrying non-safe method on network error", method=method, endpoint=endpoint, error=str(e))
                    raise

    async def upload(self, endpoint: str, files: dict, **kwargs) -> Dict[str, Any]:
        """Uploads files to files_url with same retry/auth."""
        token = await pyrus_auth.get_token()
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        headers["User-Agent"] = "Pyrus-FastMCP-Server/0.1.0"
        
        url = f"{pyrus_auth.files_url.rstrip('/')}{endpoint}"
        
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
            reraise=True
        ):
            with attempt:
                try:
                    logger.debug("Executing Pyrus API upload", endpoint=endpoint)
                    req = self._client.build_request("POST", url, headers=headers, files=files, **kwargs)
                    response = await self._client.send(req, stream=True)
                    
                    if response.status_code == 429:
                        logger.warning("Pyrus Rate Limit Hit", endpoint=endpoint)
                        raise PyrusRateLimitError("Rate limit exceeded (429)")
                        
                    if response.status_code >= 400:
                        await response.aread()
                        error_body = response.text[:200].replace('\n', ' ')
                        logger.error("Pyrus API Error", status_code=response.status_code, text=error_body)
                        raise PyrusAPIError(f"Pyrus API returned {response.status_code}: {error_body}")
                        
                    size = 0
                    chunks = []
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_RESPONSE_BYTES:
                            raise PyrusSizeLimitError(f"Response size exceeds limit of {MAX_RESPONSE_BYTES}")
                        chunks.append(chunk)
                        
                    body = b"".join(chunks)
                    if body:
                        return json.loads(body)
                    return {}
                except Exception as e:
                    if isinstance(e, (httpx.NetworkError, httpx.TimeoutException)):
                        logger.warning("Retrying upload on network error", endpoint=endpoint, error=str(e))
                    raise

    # Convenience methods
    async def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("POST", endpoint, **kwargs)

    async def put(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("PUT", endpoint, **kwargs)
        
    async def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        return await self.request("DELETE", endpoint, **kwargs)

# Global client instance
pyrus_client = PyrusClient()
