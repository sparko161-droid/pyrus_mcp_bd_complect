import httpx
import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from ..config import settings
from .exceptions import PyrusAuthError

logger = structlog.get_logger("pyrus_auth")

class PyrusAuthenticator:
    def __init__(self):
        self._access_token: Optional[str] = None
        self._expires_at: Optional[datetime] = None
        
        # Tenant specific routing returned by /auth
        self.api_url: str = settings.pyrus_api_url
        self.files_url: str = ""
        import asyncio
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        """
        Returns a valid access token. If the current token is missing or expired,
        it automatically authenticates with the Pyrus API.
        """
        now = datetime.now(timezone.utc)
        
        # Buffer of 5 minutes before actual expiration
        if self._access_token and self._expires_at and now < (self._expires_at - timedelta(minutes=5)):
            return self._access_token
            
        async with self._lock:
            # Double check within the lock
            now = datetime.now(timezone.utc)
            if self._access_token and self._expires_at and now < (self._expires_at - timedelta(minutes=5)):
                return self._access_token

            await self._authenticate()
            if not self._access_token:
                raise PyrusAuthError("Failed to retrieve access token")
                
            return self._access_token

    async def _authenticate(self) -> None:
        """
        Calls POST /auth using login and security_key to get a short-lived access token.
        """
        if not settings.pyrus_login or not settings.pyrus_security_key:
            raise PyrusAuthError("Missing pyrus_login or pyrus_security_key in configuration")

        auth_url = f"{settings.pyrus_api_url.rstrip('/')}/auth"
        
        logger.info("Authenticating with Pyrus API", url=auth_url, login=settings.pyrus_login)
        
                async with httpx.AsyncClient() as client:
            auth_payload = {
                "login": settings.pyrus_login,
                "security_key": settings.pyrus_security_key
            }
            if hasattr(settings, "pyrus_person_id") and settings.pyrus_person_id:
                auth_payload["person_id"] = int(settings.pyrus_person_id)
                
            response = await client.post(
                auth_url,
                json=auth_payload,
                timeout=10.0
            )
            
            if response.status_code != 200:
                logger.error("Pyrus /auth failed", status_code=response.status_code, body=response.text)
                raise PyrusAuthError(f"Authentication failed with status {response.status_code}")
                
            data = response.json()
            self._access_token = data.get("access_token")
            
            # Pyrus API doesn't explicitly return expires_in in some docs, but it's typically valid for a session.
            # We'll assume a standard 12-hour expiration for safety if not provided, though production might need parsing.
            expires_in_seconds = data.get("expires_in", 12 * 3600) 
            self._expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
            
            # Extract tenant-specific routing if provided
            if "api_url" in data:
                self.api_url = data["api_url"]
            if "files_url" in data:
                self.files_url = data["files_url"]
                
            logger.info("Successfully authenticated with Pyrus", expires_at=self._expires_at.isoformat())

# Global authenticator instance
pyrus_auth = PyrusAuthenticator()

