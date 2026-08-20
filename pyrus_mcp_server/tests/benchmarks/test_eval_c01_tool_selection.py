"""
EVAL-C01: Tool selection benchmark.
Verifies that the tool registry contains the expected tools per namespace
and that tool schemas are valid JSON Schema objects.
"""
import pytest
import json
import importlib
import sys
import os

# Add project to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))


def _get_registered_tools() -> dict:
    """Import tool registry and return registered tools dict."""
    from pyrus_mcp.tools.registry import tool_registry
    # Force import of all tool modules to trigger registration
    import pyrus_mcp.tools.forms
    import pyrus_mcp.tools.tasks
    import pyrus_mcp.tools.members
    import pyrus_mcp.tools.catalogs
    import pyrus_mcp.tools.misc
    import pyrus_mcp.tools.knowledge
    return tool_registry.tools


# --- Pyrus namespace ---

EXPECTED_PYRUS_TOOLS = [
    "get_forms", "get_form",
    "get_task", "get_registry", "create_task", "add_comment",
    "batch_update_tasks", "batch_close_tasks",
    "get_members", "get_roles",
    "get_catalogs", "get_catalog",
    "get_announcements", "download_file", "upload_file",
]

EXPECTED_KNOWLEDGE_TOOLS = [
    "search_knowledge", "get_knowledge_document",
    "create_knowledge_draft", "submit_knowledge_revision",
    "approve_knowledge_revision", "publish_knowledge_to_pyrus",
]


@pytest.mark.benchmark
def test_pyrus_tools_registered():
    """Every expected Pyrus tool must be present in the registry."""
    tools = _get_registered_tools()
    registered_names = set(tools.keys())
    missing = [t for t in EXPECTED_PYRUS_TOOLS if t not in registered_names]
    assert not missing, f"Missing Pyrus tools in registry: {missing}"


@pytest.mark.benchmark
def test_knowledge_tools_registered():
    """Every expected Knowledge tool must be present in the registry."""
    tools = _get_registered_tools()
    registered_names = set(tools.keys())
    missing = [t for t in EXPECTED_KNOWLEDGE_TOOLS if t not in registered_names]
    assert not missing, f"Missing Knowledge tools in registry: {missing}"


@pytest.mark.benchmark
def test_all_tools_have_valid_input_schema():
    """Every registered tool must have a non-empty inputSchema with 'type': 'object'."""
    tools = _get_registered_tools()
    for name, tool in tools.items():
        schema = tool.inputSchema
        assert schema is not None, f"Tool '{name}' has no inputSchema"
        assert isinstance(schema, dict), f"Tool '{name}' inputSchema is not a dict: {type(schema)}"
        assert schema.get("type") == "object", (
            f"Tool '{name}' inputSchema.type must be 'object', got '{schema.get('type')}'"
        )
        assert "properties" in schema, f"Tool '{name}' inputSchema has no 'properties' key"


@pytest.mark.benchmark
def test_no_duplicate_tool_names():
    """Tool names must be unique across the registry."""
    tools = _get_registered_tools()
    names = list(tools.keys())
    assert len(names) == len(set(names)), f"Duplicate tool names found: {[n for n in names if names.count(n) > 1]}"


@pytest.mark.benchmark
def test_tool_handlers_are_async():
    """Every registered tool handler must be an async function."""
    from pyrus_mcp.tools.registry import tool_registry
    # Trigger imports
    import pyrus_mcp.tools.forms
    import pyrus_mcp.tools.tasks
    import pyrus_mcp.tools.members
    import pyrus_mcp.tools.catalogs
    import pyrus_mcp.tools.misc
    import pyrus_mcp.tools.knowledge
    import asyncio
    for name, handler in tool_registry.handlers.items():
        assert asyncio.iscoroutinefunction(handler), (
            f"Tool handler '{name}' is not async — MCP tools must be async"
        )


@pytest.mark.benchmark
def test_required_fields_are_listed():
    """Tools with required parameters must declare them in 'required' array."""
    tools = _get_registered_tools()
    for name, tool in tools.items():
        schema = tool.inputSchema
        props = schema.get("properties", {})
        required = schema.get("required", [])
        # Every required field must exist in properties
        for req_field in required:
            assert req_field in props, (
                f"Tool '{name}' declares required field '{req_field}' but it's not in properties"
            )
