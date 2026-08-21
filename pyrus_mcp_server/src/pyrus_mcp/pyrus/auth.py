import httpx
import structlog
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from ..config import settings
from .exceptions import PyrusAuthError
from ..context import pyrus_login_ctx, pyrus_security_key_ctx, pyrus_person_id_ctx

logger = structlog.get_logger("pyrus_auth")

class PyrusAuthenticator:
    def __init__(self):
        # Cache tokens keyed by login + person_id
        self._tokens: Dict[str, str] = {}
        self._expires: Dict[str, datetime] = {}
        
        self.api_url: str = settings.pyrus_api_url
        self.files_url: str = settings.pyrus_api_url
        self._lock = asyncio.Lock()

    @property
    def login(self) -> str:
        login, _, _ = self._get_context_creds()
        return login or "default"

    def _get_context_creds(self):
        login = pyrus_login_ctx.get() or settings.pyrus_login
        sec_key = pyrus_security_key_ctx.get() or settings.pyrus_security_key
        person_id = pyrus_person_id_ctx.get()
        if not person_id and hasattr(settings, "pyrus_person_id") and settings.pyrus_person_id:
            person_id = settings.pyrus_person_id
        return login, sec_key, person_id

    async def get_token(self) -> str:
        login, sec_key, person_id = self._get_context_creds()
        if not login or not sec_key:
            raise PyrusAuthError("Missing pyrus_login or pyrus_security_key in context/config")
            
        cache_key = f"{login}:{person_id or ''}"
        now = datetime.now(timezone.utc)
        
        # Buffer of 5 minutes before actual expiration
        if cache_key in self._tokens and cache_key in self._expires:
            if now < (self._expires[cache_key] - timedelta(minutes=5)):
                return self._tokens[cache_key]
            
        async with self._lock:
            now = datetime.now(timezone.utc)
            if cache_key in self._tokens and cache_key in self._expires:
                if now < (self._expires[cache_key] - timedelta(minutes=5)):
                    return self._tokens[cache_key]

            token = await self._authenticate(login, sec_key, person_id, cache_key)
            if not token:
                raise PyrusAuthError("Failed to retrieve access token")
            return token

    async def _authenticate(self, login: str, sec_key: str, person_id: Optional[str], cache_key: str) -> str:
        auth_url = f"{settings.pyrus_api_url.rstrip('/')}/auth"
        logger.info("Authenticating with Pyrus API", url=auth_url, login=login)
        
        async with httpx.AsyncClient() as client:
            auth_payload = {"login": login, "security_key": sec_key}
            if person_id:
                try:
                    auth_payload["person_id"] = int(person_id)
                except ValueError:
                    logger.warning("Invalid person_id, ignoring", person_id=person_id)
                
            response = await client.post(auth_url, json=auth_payload, timeout=10.0)
            
            if response.status_code != 200:
                logger.error("Pyrus /auth failed", status_code=response.status_code, body=response.text)
                raise PyrusAuthError(f"Authentication failed with status {response.status_code}")
                
            data = response.json()
            token = data.get("access_token")
            self._tokens[cache_key] = token
            
            expires_in_seconds = data.get("expires_in", 12 * 3600) 
            self._expires[cache_key] = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
            
            if "api_url" in data:
                self.api_url = data["api_url"]
            if "files_url" in data:
                self.files_url = data["files_url"]
                
            logger.info("Successfully authenticated with Pyrus", expires_at=self._expires[cache_key].isoformat())
            return token

pyrus_auth = PyrusAuthenticator()
