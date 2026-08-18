import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
from ..models.domain.catalogs import CatalogHeader, Catalog

@tool_registry.register(
    name="get_catalogs",
    description="Returns the list of all available catalogs (directories).",
    inputSchema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_catalogs(arguments: dict) -> list[TextContent]:
    data = await pyrus_client.get("/catalogs")
    catalogs = [CatalogHeader(**c) for c in data.get("catalogs", [])]
    return [TextContent(type="text", text=json.dumps([c.model_dump() for c in catalogs]))]

@tool_registry.register(
    name="get_catalog",
    description="Returns the full contents (items) of a specific catalog by its ID.",
    inputSchema={
        "type": "object",
        "properties": {
            "catalog_id": {"type": "integer", "description": "The ID of the catalog to fetch"}
        },
        "required": ["catalog_id"]
    }
)
async def get_catalog(arguments: dict) -> list[TextContent]:
    catalog_id = arguments["catalog_id"]
    data = await pyrus_client.get(f"/catalogs/{catalog_id}")
    catalog = Catalog(**data)
    return [TextContent(type="text", text=json.dumps(catalog.model_dump()))]
