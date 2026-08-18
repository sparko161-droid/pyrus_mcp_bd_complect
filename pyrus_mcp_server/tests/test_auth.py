import pytest
from datetime import timedelta
from pyrus_mcp.models.identity import Client, utc_now
from pyrus_mcp.auth.registry import client_registry
from pyrus_mcp.auth.tokens import token_service

def test_client_registration():
    client = Client(name="Test Agent", tenant_id="tenant-123", allowed_scopes=["tasks:read"])
    client_registry.register_client(client)
    
    fetched = client_registry.get_client(client.id)
    assert fetched is not None
    assert fetched.tenant_id == "tenant-123"

def test_token_issuance_and_validation():
    client = Client(name="Agent B", tenant_id="tenant-456", allowed_scopes=["tasks:write"])
    token = token_service.issue_token(client)
    
    assert token.token is not None
    assert token.tenant_id == "tenant-456"
    assert "tasks:write" in token.scopes
    
    validated = token_service.validate_token(token.token)
    assert validated is not None
    assert validated.client_id == client.id

def test_token_revocation():
    client = Client(name="Agent C", tenant_id="tenant-789", allowed_scopes=[])
    token = token_service.issue_token(client)
    
    assert token_service.validate_token(token.token) is not None
    
    token_service.revoke_token(token.token)
    
    assert token_service.validate_token(token.token) is None

def test_token_expiry():
    client = Client(name="Agent D", tenant_id="tenant-000", allowed_scopes=[])
    token = token_service.issue_token(client)
    
    # Manually expire the token
    token.expires_at = utc_now() - timedelta(minutes=1)
    
    assert token_service.validate_token(token.token) is None
