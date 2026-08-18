from abc import ABC, abstractmethod
from typing import Optional, Any
import time


class CacheAdapter(ABC):
    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        ...

    @abstractmethod
    async def set(self, key: str, value: Any, ttl_seconds: int = 3600) -> None:
        ...

    @abstractmethod
    async def delete(self, key: str) -> None:
        ...


class MemoryCache(CacheAdapter):
    """Default in-memory TTL cache. No size limit — suitable for small datasets."""

    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}

    async def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            value, expires_at = self._store[key]
            if time.time() < expires_at:
                return value
            del self._store[key]
        return None

    async def set(self, key: str, value: Any, ttl_seconds: int = 3600) -> None:
        self._store[key] = (value, time.time() + ttl_seconds)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)


class RedisCache(CacheAdapter):
    """
    Redis-backed cache. Activated when REDIS_URL is set in config.
    Requires: pip install redis[asyncio]
    """

    def __init__(self, redis_url: str):
        import redis.asyncio as aioredis
        self._client = aioredis.from_url(redis_url, decode_responses=True)

    async def get(self, key: str) -> Optional[Any]:
        import json
        val = await self._client.get(key)
        return json.loads(val) if val is not None else None

    async def set(self, key: str, value: Any, ttl_seconds: int = 3600) -> None:
        import json
        await self._client.setex(key, ttl_seconds, json.dumps(value))

    async def delete(self, key: str) -> None:
        await self._client.delete(key)


def build_cache(redis_url: Optional[str] = None) -> CacheAdapter:
    if redis_url:
        return RedisCache(redis_url)
    return MemoryCache()
