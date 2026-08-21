import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pyrus_mcp_server', 'src'))

from pyrus_mcp.tools.registry import tool_registry
import pyrus_mcp.tools

tools = tool_registry.get_tool_list()

print(f"Total tools registered: {len(tools)}")
for t in tools:
    schema = t.inputSchema or {}
    props = schema.get('properties', {})
    reqs = schema.get('required', [])
    print(f"- {t.name}: {len(props)} parameters, {len(reqs)} required")
