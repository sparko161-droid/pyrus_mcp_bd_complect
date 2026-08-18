import pytest
from starlette.testclient import TestClient
from pyrus_mcp.server import app
from pyrus_mcp.tools.registry import tool_registry

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_production_smoke_health_check(client):
    """Smoke test: /health must return version 1.0.0 and up status."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "up"
    assert data["version"] == "1.0.0"

def test_production_smoke_tool_inventory():
    """Smoke test: All registered tools must be present and well-formed."""
    tools = tool_registry.get_tool_list()
    tool_names = {t.name for t in tools}
    
    expected_core_tools = {
        "get_members", "get_roles",
        "get_catalogs", "get_catalog",
        "get_forms", "get_form",
        "get_task", "get_registry",
        "create_task", "add_comment",
        "batch_update_tasks", "batch_close_tasks",
        "upload_file", "download_file", "get_announcements"
    }
    
    missing = expected_core_tools - tool_names
    assert not missing, f"Missing critical production tools: {missing}"
    assert len(tools) >= 15
