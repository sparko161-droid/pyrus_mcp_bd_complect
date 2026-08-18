from mcp.server import Server
from .registry import readonly_router

# Import to trigger registration decorators
import pyrus_mcp.tools.members
import pyrus_mcp.tools.catalogs
import pyrus_mcp.tools.forms
import pyrus_mcp.tools.tasks
import pyrus_mcp.tools.misc

def register_readonly_tools(server: Server):
    """
    Hooks all read-only MCP tools into the main server instance.
    """
    for tool in readonly_router.get_tool_list():
        # Using a closure to capture the tool name
        def make_handler(name: str):
            async def handler(arguments: dict):
                return await readonly_router.call(name, arguments)
            return handler
            
        server.tool()(
            name=tool.name,
            description=tool.description
        )(make_handler(tool.name))
