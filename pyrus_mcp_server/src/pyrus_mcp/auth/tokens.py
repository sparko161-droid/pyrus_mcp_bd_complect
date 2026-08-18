import secrets
from datetime import timedelta
from typing import Dict, Optional
from pyrus_mcp.models.identity import Token, Client, utc_now

class TokenService:
    def __init__(self):
        # In-memory storage for Phase 4.
        self._tokens: Dict[str, Token] = {}
        self.default_expiry = timedelta(hours=2)

    def issue_token(self, client: Client) -> Token:
        token_str = secrets.token_urlsafe(32)
        expires_at = utc_now() + self.default_expiry
        
        token = Token(
            token=token_str,
            client_id=client.id,
            tenant_id=client.tenant_id,
            scopes=client.allowed_scopes,
            expires_at=expires_at
        )
        self._tokens[token_str] = token
        return token

    def validate_token(self, token_str: str) -> Optional[Token]:
        token = self._tokens.get(token_str)
        if not token:
            return None
        
        if token.is_revoked:
            return None
            
        if utc_now() > token.expires_at:
            return None
            
        return token

    def revoke_token(self, token_str: str) -> bool:
        token = self._tokens.get(token_str)
        if token and not token.is_revoked:
            token.is_revoked = True
            return True
        return False

# Global token service instance
token_service = TokenService()
