import pytest
from pyrus_mcp.auth.tokens import token_service
from pyrus_mcp.models.identity import Client
from pyrus_mcp.context import tenant_id

@pytest.mark.asyncio
async def test_auth_fuzz_malformed_tokens():
    """Тестирование устойчивости к мусорным, битым и инъекционным токенам."""
    fuzz_payloads = [
        "",
        "   ",
        "Bearer",
        "' OR '1'='1",
        "'; DROP TABLE tokens; --",
        "<script>alert(1)</script>",
        "\x00\x01\x02\xff",
        "A" * 10000,
        "null",
        "undefined",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
    ]
    for payload in fuzz_payloads:
        result = token_service.validate_token(payload)
        assert result is None, f"Expected validation to fail for payload: {payload!r}"

def test_cross_tenant_isolation():
    """Проверка строгой изоляции между разными тенантами."""
    client_a = Client(id="client-a", name="Agent Alpha", tenant_id="tenant-alpha", allowed_scopes=["tasks:read"])
    client_b = Client(id="client-b", name="Agent Beta", tenant_id="tenant-beta", allowed_scopes=["tasks:read", "tasks:write"])
    
    token_a = token_service.issue_token(client_a)
    token_b = token_service.issue_token(client_b)
    
    val_a = token_service.validate_token(token_a.token)
    val_b = token_service.validate_token(token_b.token)
    
    assert val_a.tenant_id == "tenant-alpha"
    assert val_b.tenant_id == "tenant-beta"
    assert val_a.tenant_id != val_b.tenant_id
    assert "tasks:write" not in val_a.scopes
    assert "tasks:write" in val_b.scopes
