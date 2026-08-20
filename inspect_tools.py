import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pyrus_mcp_server', 'src'))

from pyrus_mcp.tools.registry import tool_registry
import pyrus_mcp.tools.members
import pyrus_mcp.tools.catalogs
import pyrus_mcp.tools.forms
import pyrus_mcp.tools.tasks
import pyrus_mcp.tools.misc
import pyrus_mcp.tools.pyrus_kb

tools = tool_registry.get_tool_list()

output = []
for t in tools:
    output.append({
        'name': t.name,
        'description': t.description,
        'schema_keys': list(t.inputSchema.get('properties', {}).keys()),
        'required': t.inputSchema.get('required', [])
    })

print(json.dumps(output, indent=2))
