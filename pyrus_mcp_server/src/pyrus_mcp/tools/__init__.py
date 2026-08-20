from mcp.server import Server
from mcp.types import Tool
from .registry import tool_registry

# Import to trigger registration decorators
import pyrus_mcp.tools.members
import pyrus_mcp.tools.catalogs
import pyrus_mcp.tools.forms
import pyrus_mcp.tools.tasks
import pyrus_mcp.tools.legacy_misc
import pyrus_mcp.tools.legacy_catalogs
import pyrus_mcp.tools.legacy_lists
import pyrus_mcp.tools.legacy_contacts_roles
import pyrus_mcp.tools.legacy_announcements
import pyrus_mcp.tools.legacy_calendar_tasks
import pyrus_mcp.tools.legacy_task_aliases
import pyrus_mcp.tools.misc
import pyrus_mcp.tools.pyrus_kb

def register_tools(server: Server):
    """
    Hooks all MCP tools into the main server instance.
    """
    @server.list_tools()
    async def handle_list_tools() -> list[Tool]:
        return [
            Tool(
                name=t.name,
                description=t.description,
                inputSchema=t.inputSchema
            )
            for t in tool_registry.get_tool_list()
        ]

    @server.call_tool()
    async def handle_call_tool(name: str, arguments: dict | None) -> list:
        if arguments is None:
            arguments = {}
        return await tool_registry.call(name, arguments)


