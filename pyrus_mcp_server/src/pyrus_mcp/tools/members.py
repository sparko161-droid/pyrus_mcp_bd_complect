from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
from ..models.domain.members import Person, Role

@tool_registry.register(
    name="get_members",
    description="Get all organization members.",
        inputSchema={
        "type": "object",
        "properties": {
            "include_inactive": {"type": "boolean", "description": "Include blocked/inactive members"}
        },
        "required": []
    }
)
async def get_members(arguments: dict) -> list[TextContent]:
    url = "/members"
    if arguments.get("include_inactive"):
        url += "?include_inactive=y"
    data = await pyrus_client.get(url)
    return [TextContent(type="text", text=json.dumps(data))]))]

@tool_registry.register(
    name="get_roles",
    description="Get all roles.",
    inputSchema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_roles(arguments: dict) -> list[TextContent]:
    data = await pyrus_client.get("/roles")
    roles = [Role(**r) for r in data.get("roles", [])]
    import json
    return [TextContent(type="text", text=json.dumps([r.model_dump() for r in roles]))]

