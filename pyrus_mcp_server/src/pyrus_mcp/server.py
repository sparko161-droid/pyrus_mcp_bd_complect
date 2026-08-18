import asyncio
from fastmcp import FastMCP
from pyrus_mcp.config import settings

mcp = FastMCP(
    "pyrus_mcp_server",
    description="Python FastMCP Server for Pyrus API",
    dependencies=["httpx", "pydantic"]
)

@mcp.tool()
async def health_check() -> str:
    """Returns the health status of the Pyrus MCP Server."""
    return f"Pyrus MCP Server is alive. Target API: {settings.pyrus_api_url}"

def main() -> None:
    # Later we will support transport configuration (stdio vs http)
    # For now, default to stdio which Claude / Antigravity use directly
    mcp.run()

if __name__ == "__main__":
    main()
