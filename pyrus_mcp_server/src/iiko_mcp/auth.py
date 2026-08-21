import httpx
import structlog
import asyncio
import json
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional
from .config import iiko_settings
from .exceptions import IikoAuthError

logger = structlog.get_logger("iiko_auth")

def _parse_jwt_exp(token: str) -> Optional[datetime]:
    try:
        parts = token.split('.')
        if len(parts) == 3:
            payload = parts[1]
            padded = payload + '=' * (-len(payload) % 4)
            decoded = base64.urlsafe_b64decode(padded)
            claims = json.loads(decoded)
            if 'exp' in claims:
                return datetime.fromtimestamp(claims['exp'], tz=timezone.utc)
    except Exception:
        return None
    return None

class IikoAuthenticator:
    def __init__(self):
        self._access_token: Optional[str] = None
        self._expires_at: Optional[datetime] = None
        self.api_url: str = iiko_settings.iiko_api_url
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        now = datetime.now(timezone.utc)
        
        if self._access_token and self._expires_at and now < (self._expires_at - timedelta(minutes=5)):
            return self._access_token
            
        async with self._lock:
            # Double check pattern inside lock
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
                logger.error("iiko access_token failed", status_code=response.status_code, body=response.text[:200])
                raise IikoAuthError(f"Authentication failed with status {response.status_code}")
                
            data = response.json()
            self._access_token = data.get("token")
            
            expires_at = None
            if "expiresIn" in data:
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=data["expiresIn"])
            elif self._access_token:
                expires_at = _parse_jwt_exp(self._access_token)
                
            if not expires_at:
                expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
                
            self._expires_at = expires_at
                
            logger.info("Successfully authenticated with iiko", expires_at=self._expires_at.isoformat())

iiko_auth = IikoAuthenticator()
