from mcp.types import TextContent
from .registry import readonly_router
from ..pyrus.client import pyrus_client
from ..models.domain.members import Person, Role

@readonly_router.register(
    name="get_members",
    description="Returns the list of all members (persons/bots) in the organization.",
    inputSchema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_members(arguments: dict) -> list[TextContent]:
    data = await pyrus_client.get("/members")
    # Validate and serialize
    persons = [Person(**p) for p in data.get("members", [])]
    # For MCP, we return text content (usually JSON stringified for AI to parse)
    import json
    return [TextContent(type="text", text=json.dumps([p.model_dump() for p in persons]))]

@readonly_router.register(
    name="get_roles",
    description="Returns the list of all roles in the organization.",
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
