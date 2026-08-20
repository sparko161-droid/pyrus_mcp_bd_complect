import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

def register_legacy_announcements():
    @tool_registry.register(
        name="get_announcement",
        description="Get a single announcement by id.",
        inputSchema={
            "type": "object",
            "properties": {
                "id": {"type": "integer"}
            },
            "required": ["id"]
        }
    )
    async def get_announcement(arguments: dict) -> list[TextContent]:
        data = await pyrus_client.get(f"/announcements/{arguments['id']}")
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="create_announcement",
        description="Create an announcement.",
        inputSchema={
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "attachments": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["text"]
        }
    )
    async def create_announcement(arguments: dict) -> list[TextContent]:
        payload = {"text": arguments["text"]}
        if "attachments" in arguments: payload["attachments"] = arguments["attachments"]
        data = await pyrus_client.post("/announcements", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="comment_announcement",
        description="Comment on an announcement.",
        inputSchema={
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "text": {"type": "string"},
                "attachments": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["id", "text"]
        }
    )
    async def comment_announcement(arguments: dict) -> list[TextContent]:
        payload = {"text": arguments["text"]}
        if "attachments" in arguments: payload["attachments"] = arguments["attachments"]
        data = await pyrus_client.post(f"/announcements/{arguments['id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

register_legacy_announcements()
