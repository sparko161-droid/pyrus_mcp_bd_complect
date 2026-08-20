import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
from ..models.domain.extra import Announcement

@tool_registry.register(
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

@tool_registry.register(
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

@tool_registry.register(
    name="upload_file",
    description="Uploads a file to Pyrus and returns a GUID that can be used to attach the file to tasks or comments.",
    inputSchema={
        "type": "object",
        "properties": {
            "filename": {"type": "string", "description": "The name of the file"},
            "content_base64": {"type": "string", "description": "Base64 encoded file content"}
        },
        "required": ["filename", "content_base64"]
    }
)
async def upload_file(arguments: dict) -> list[TextContent]:
    import base64
    filename = arguments["filename"]
    content = base64.b64decode(arguments["content_base64"])
    
    files = {'file': (filename, content)}
    data = await pyrus_client.upload("/files/upload", files=files)
        
    guid = data.get("guid")
    return [TextContent(type="text", text=f"File uploaded successfully. GUID: {guid}")]
