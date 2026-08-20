import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

def register_legacy_contacts_roles():
    @tool_registry.register(name="create_member", description="Create a member.", inputSchema={"type": "object", "properties": {"first_name": {"type": "string"}, "last_name": {"type": "string"}, "email": {"type": "string"}}, "required": ["first_name", "last_name", "email"]})
    async def create_member(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post("/members", json=args)))]
    
    @tool_registry.register(name="update_member", description="Update a member.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "first_name": {"type": "string"}, "last_name": {"type": "string"}}, "required": ["id"]})
    async def update_member(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.put(f"/members/{id}", json=args)))]

    @tool_registry.register(name="get_contacts", description="Get contacts.", inputSchema={"type": "object", "properties": {}, "required": []})
    async def get_contacts(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get("/contacts")))]
        
    @tool_registry.register(name="get_member", description="Get a member.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]})
    async def get_member(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get(f"/members/{args['id']}")))]

    @tool_registry.register(name="get_bots", description="Get bots (members).", inputSchema={"type": "object", "properties": {}, "required": []})
    async def get_bots(args: dict) -> list[TextContent]:
        d = await pyrus_client.get("/members")
        bots = [m for m in d.get("members", []) if m.get("type") == "bot"]
        return [TextContent(type="text", text=json.dumps({"bots": bots}))]
        
    @tool_registry.register(name="create_role", description="Create a role.", inputSchema={"type": "object", "properties": {"name": {"type": "string"}, "member_ids": {"type": "array", "items": {"type": "integer"}}}, "required": ["name"]})
    async def create_role(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post("/roles", json=args)))]

    @tool_registry.register(name="update_role", description="Update a role.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "name": {"type": "string"}, "member_ids": {"type": "array", "items": {"type": "integer"}}}, "required": ["id"]})
    async def update_role(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.put(f"/roles/{id}", json=args)))]

    @tool_registry.register(name="delete_role", description="Delete a role.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "task_receiver_id": {"type": "integer"}}, "required": ["id"]})
    async def delete_role(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.delete(f"/roles/{id}", params=args)))]

    @tool_registry.register(name="get_role", description="Get a role.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]})
    async def get_role(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get(f"/roles/{args['id']}")))]

    @tool_registry.register(name="get_profile", description="Get profile.", inputSchema={"type": "object", "properties": {}, "required": []})
    async def get_profile(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get("/profile")))]

register_legacy_contacts_roles()
