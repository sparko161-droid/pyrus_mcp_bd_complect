import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

def register_legacy_lists():
    @tool_registry.register(name="get_inbox", description="Get inbox.", inputSchema={"type": "object", "properties": {"item_count": {"type": "integer"}}, "required": []})
    async def get_inbox(args: dict) -> list[TextContent]:
        url = "/inbox" + (f"?item_count={args['item_count']}" if "item_count" in args else "")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get(url)))]

    @tool_registry.register(name="get_lists", description="Get lists.", inputSchema={"type": "object", "properties": {}, "required": []})
    async def get_lists(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get("/lists")))]

    @tool_registry.register(name="get_list", description="Get a list.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]})
    async def get_list(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get(f"/lists/{args['id']}")))]

    @tool_registry.register(name="create_list", description="Create a list.", inputSchema={"type": "object", "properties": {"name": {"type": "string"}, "steps": {"type": "array", "items": {"type": "integer"}}}, "required": ["name"]})
    async def create_list(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.put("/lists", json=args)))]

    @tool_registry.register(name="update_list", description="Update a list.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "name": {"type": "string"}, "steps": {"type": "array", "items": {"type": "integer"}}, "added_task_ids": {"type": "array", "items": {"type": "integer"}}, "removed_task_ids": {"type": "array", "items": {"type": "integer"}}}, "required": ["id"]})
    async def update_list(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post(f"/lists/{id}", json=args)))]

    @tool_registry.register(name="delete_list", description="Delete a list.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]})
    async def delete_list(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.delete(f"/lists/{id}")))]

    @tool_registry.register(name="get_task_list", description="List tasks in a list.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "item_count": {"type": "integer"}, "include_archived": {"type": "boolean"}}, "required": ["id"]})
    async def get_task_list(args: dict) -> list[TextContent]:
        id = args.pop("id")
        params = [f"{k}={v}" for k, v in args.items()]
        url = f"/lists/{id}/tasks" + ("?" + "&".join(params) if params else "")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get(url)))]

register_legacy_lists()
