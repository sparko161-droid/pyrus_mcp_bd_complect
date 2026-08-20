import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

def register_legacy_catalogs():
    @tool_registry.register(name="create_catalog", description="Create a catalog.", inputSchema={"type": "object", "properties": {"name": {"type": "string"}, "catalog_headers": {"type": "array", "items": {"type": "string"}}}, "required": ["name", "catalog_headers"]})
    async def create_catalog(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.put("/catalogs", json=args)))] # Pyrus creates with PUT

    @tool_registry.register(name="sync_catalog", description="Sync a catalog.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "apply": {"type": "boolean"}, "catalog_headers": {"type": "array", "items": {"type": "string"}}, "items": {"type": "array", "items": {"type": "object"}}}, "required": ["id"]})
    async def sync_catalog(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post(f"/catalogs/{id}", json=args)))]

    @tool_registry.register(name="update_catalog_items", description="Update items in a catalog.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}, "added": {"type": "array", "items": {"type": "object"}}, "deleted": {"type": "array", "items": {"type": "string"}}, "updated": {"type": "array", "items": {"type": "object"}}}, "required": ["id"]})
    async def update_catalog_items(args: dict) -> list[TextContent]:
        id = args.pop("id")
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post(f"/catalogs/{id}", json=args)))]

register_legacy_catalogs()
