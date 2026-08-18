from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
import uuid

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    tenant_id: str
    allowed_scopes: List[str]
    is_active: bool = True

class Token(BaseModel):
    token: str
    client_id: str
    tenant_id: str
    scopes: List[str]
    issued_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime
    is_revoked: bool = False
