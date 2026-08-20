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
    description="Get a download URL for a file without transferring its contents. Caller fetches URL themselves with header 'Authorization: Bearer <access_token>'.",
    inputSchema={
        "type": "object",
        "properties": {
            "file_id": {"type": "integer", "description": "The ID of the attached file to download (not the GUID, but the integer ID from task attachments)"}
        },
        "required": ["file_id"]
    }
)
async def download_file(arguments: dict) -> list[TextContent]:
    file_id = arguments["file_id"]
    
    try:
        data = await pyrus_client.download(f"/files/download/{file_id}")
        import base64
        b64_content = base64.b64encode(data).decode('utf-8')
        return [TextContent(type="text", text=f"File downloaded successfully. Base64:\n{b64_content}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Failed to download file: {str(e)}")]

@tool_registry.register(
    name="upload_file",
    description="Get URL and token for uploading a file to Pyrus directly (caller uploads, not routed through this server). POST multipart/form-data field 'file', header 'Authorization: Bearer <access_token>'. Pyrus responds with a guid to pass to create_task/comment_task or attach_new_file_version. Target belongs to whichever environment the call is authenticated against — for customer environments pass that same access_token/api_url here.",
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


