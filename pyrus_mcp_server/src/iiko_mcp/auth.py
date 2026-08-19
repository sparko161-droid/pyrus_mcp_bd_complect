import httpx
import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional
from .config import iiko_settings
from .exceptions import IikoAuthError

logger = structlog.get_logger("iiko_auth")

class IikoAuthenticator:
    def __init__(self):
        self._access_token: Optional[str] = None
        self._expires_at: Optional[datetime] = None
        self.api_url: str = iiko_settings.iiko_api_url

    async def get_token(self) -> str:
        now = datetime.now(timezone.utc)
        
        if self._access_token and self._expires_at and now < (self._expires_at - timedelta(minutes=5)):
            return self._access_token
            
        await self._authenticate()
        if not self._access_token:
            raise IikoAuthError("Failed to retrieve access token")
            
        return self._access_token

    async def _authenticate(self) -> None:
        if not iiko_settings.iiko_api_login:
            raise IikoAuthError("Missing iiko_api_login in configuration")

        auth_url = f"{self.api_url.rstrip('/')}/access_token"
        
        logger.info("Authenticating with iiko API", url=auth_url)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                auth_url,
                json={
                    "apiLogin": iiko_settings.iiko_api_login
                },
                timeout=10.0
            )
            
            if response.status_code != 200:
                logger.error("iiko access_token failed", status_code=response.status_code, body=response.text)
                raise IikoAuthError(f"Authentication failed with status {response.status_code}")
                
            data = response.json()
            # iiko token typically valid for ~1 hour.
            self._access_token = data.get("token")
            # Assume 1 hour if not specified
            self._expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
                
            logger.info("Successfully authenticated with iiko", expires_at=self._expires_at.isoformat())

iiko_auth = IikoAuthenticator()
