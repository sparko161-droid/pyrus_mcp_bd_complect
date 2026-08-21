import pytest
from starlette.testclient import TestClient
from pyrus_mcp.server import create_app
from pyrus_mcp.tools.registry import tool_registry

@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client

def test_production_smoke_health_check(client):
    """Smoke test: /health must return version 1.0.0 and healthy/up status."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ["healthy", "up"]
    assert data["version"] == "1.0.0"

def test_production_smoke_readiness_check(client):
    """Smoke test: /ready must return status ready."""
    resp = client.get("/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"

def test_production_smoke_tool_inventory():
    """Smoke test: Exactly 61 registered tools must be present and well-formed."""
    import pyrus_mcp.tools  # Trigger all registrations
    tools = tool_registry.get_tool_list()
    tool_names = {t.name for t in tools}
    
    assert len(tools) == 61, f"Expected exactly 61 tools, found {len(tools)}: {tool_names}"
    
    expected_sample_tools = {
        "get_members", "get_roles",
        "get_catalogs", "get_catalog",
        "get_forms", "get_form",
        "get_task", "get_registry",
        "create_task", "add_comment",
        "batch_update_tasks", "batch_close_tasks",
        "upload_file", "download_file", "get_announcements",
        "get_kb_structure", "create_kb_object", "get_meetings",
        "create_list", "get_lists", "delete_role"
    }
    
    missing = expected_sample_tools - tool_names
    assert not missing, f"Missing critical production tools: {missing}"

def test_production_smoke_mcp_initialize(client):
    """Smoke test: /mcp endpoint responds to JSON-RPC initialize."""
    resp = client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "smoke-test", "version": "1.0.0"}
            }
        },
        headers={
            "x-pyrus-login": "smoke_test@standartmaster.ru",
            "x-pyrus-security-key": "smoke_test_key",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("jsonrpc") == "2.0"
    assert "result" in data
    assert data["result"]["serverInfo"]["name"] == "pyrus-mcp"

