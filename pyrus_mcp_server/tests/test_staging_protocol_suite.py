import pytest
from starlette.testclient import TestClient
from pyrus_mcp.server import create_app
from pyrus_mcp.models.identity import Client
from pyrus_mcp.auth.tokens import token_service
from pyrus_mcp.auth.registry import client_registry

@pytest.fixture
def client():
    # Use TestClient to verify Starlette endpoints
    with TestClient(create_app()) as test_client:
        yield test_client

def test_staging_health_and_ready(client):
    """Проверка доступности /health и /ready."""
    resp_health = client.get("/health")
    assert resp_health.status_code == 200
    data_health = resp_health.json()
    assert data_health["status"] in ["up", "healthy"]
    assert "version" in data_health
    
    resp_ready = client.get("/ready")
    assert resp_ready.status_code == 200
    assert resp_ready.json()["status"] == "ready"

def test_staging_metrics_endpoint(client):
    """Проверка скрейпинга /metrics без авторизации."""
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "pyrus_mcp_requests_total" in resp.text
    assert "pyrus_mcp_request_duration_seconds" in resp.text

def test_staging_auth_flow_and_context():
    """Проверка сквозного жизненного цикла токена и скоупов в staging."""
    test_client_obj = Client(id="stg-agent-1", name="Staging Agent", tenant_id="stg-tenant-99", allowed_scopes=["tasks:read", "tasks:write"])
    client_registry.register_client(test_client_obj)
    
    token = token_service.issue_token(test_client_obj)
    assert token.token is not None
    
    validated = token_service.validate_token(token.token)
    assert validated is not None
    assert validated.tenant_id == "stg-tenant-99"
    assert "tasks:read" in validated.scopes
