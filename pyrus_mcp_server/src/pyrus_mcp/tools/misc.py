import json
from mcp.types import TextContent
from .registry import readonly_router
from ..pyrus.client import pyrus_client
from ..models.domain.extra import Announcement

@readonly_router.register(
    name="get_announcements",
    description="Returns the list of announcements in the organization.",
    inputSchema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_announcements(arguments: dict) -> list[TextContent]:
    data = await pyrus_client.get("/announcements")
    announcements = [Announcement(**a) for a in data.get("announcements", [])]
    return [TextContent(type="text", text=json.dumps([a.model_dump() for a in announcements]))]

@readonly_router.register(
    name="download_file",
    description="Returns a direct download URL for a file stored in Pyrus.",
    inputSchema={
        "type": "object",
        "properties": {
            "file_id": {"type": "integer", "description": "The ID of the file to download"}
        },
        "required": ["file_id"]
    }
)
async def download_file(arguments: dict) -> list[TextContent]:
    file_id = arguments["file_id"]
    # The /files/download endpoint returns the raw file, or we can construct the URL
    # For MCP text interface, we just return the URL or metadata
    from ..pyrus.auth import pyrus_auth
    url = f"{pyrus_auth.files_url}/files/download/{file_id}"
    return [TextContent(type="text", text=f"Download URL: {url}")]
