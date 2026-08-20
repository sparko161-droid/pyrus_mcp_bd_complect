import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

@tool_registry.register(
    name="get_kb_object",
    description="Get a knowledge base entity (article or topic).",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string", "description": "The ID of the KB object"}
        },
        "required": ["kb_id"]
    }
)
async def get_kb_object(arguments: dict) -> list[TextContent]:
    kb_id = arguments["kb_id"]
    data = await pyrus_client.get(f"/knowledgebase/{kb_id}")
    return [TextContent(type="text", text=json.dumps(data))]

@tool_registry.register(
    name="create_kb_object",
    description="Create a knowledge base entity. type: 'article' or 'topic'. Body required for articles.",
    inputSchema={
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "body": {"type": "string", "description": "Markdown/HTML content"},
            "parent_id": {"type": "integer", "description": "Optional parent folder ID"}
        },
        "required": ["title", "body"]
    }
)
async def create_kb_object(arguments: dict) -> list[TextContent]:
    payload = {"title": arguments["title"], "body": arguments["body"]}
    if "parent_id" in arguments:
        payload["parent_id"] = arguments["parent_id"]
    data = await pyrus_client.post("/knowledgebase", json=payload)
    return [TextContent(type="text", text=json.dumps(data))]

@tool_registry.register(
    name="update_kb_object",
    description="Update a knowledge base entity. title must be passed with any change (Pyrus rejects update without it). Moving: pass parent_topic_id (parent_topic_id_changed flag auto-set; override only if needed).",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string"},
            "title": {"type": "string"},
            "body": {"type": "string"}
        },
        "required": ["kb_id"]
    }
)
async def update_kb_object(arguments: dict) -> list[TextContent]:
    kb_id = arguments.pop("kb_id")
    data = await pyrus_client.put(f"/knowledgebase/{kb_id}", json=arguments)
    return [TextContent(type="text", text=json.dumps(data))]

@tool_registry.register(
    name="get_kb_structure",
    description="Get knowledge base structure (tree of topics and articles).",
    inputSchema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_kb_structure(arguments: dict) -> list[TextContent]:
    data = await pyrus_client.get("/knowledgebase/structure")
    return [TextContent(type="text", text=json.dumps(data))]


@tool_registry.register(
    name="get_kb_permissions",
    description="Get knowledge base entity permissions.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string"}
        },
        "required": ["kb_id"]
    }
)
async def get_kb_permissions(arguments: dict) -> list[TextContent]:
    kb_id = arguments["kb_id"]
    data = await pyrus_client.get(f"/knowledgebase/{kb_id}/permissions")
    return [TextContent(type="text", text=json.dumps(data))]

@tool_registry.register(
    name="update_kb_permissions",
    description="Update knowledge base entity permissions.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string"},
            "permissions": {"type": "array", "items": {"type": "object"}}
        },
        "required": ["kb_id", "permissions"]
    }
)
async def update_kb_permissions(arguments: dict) -> list[TextContent]:
    kb_id = arguments.pop("kb_id")
    data = await pyrus_client.put(f"/knowledgebase/{kb_id}/permissions", json=arguments)
    return [TextContent(type="text", text=json.dumps(data))]

@tool_registry.register(
    name="delete_kb_object",
    description="Delete a knowledge base entity.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "string"},
            "delete_with_children": {"type": "boolean", "default": False}
        },
        "required": ["kb_id"]
    }
)
async def delete_kb_object(arguments: dict) -> list[TextContent]:
    kb_id = arguments["kb_id"]
    delete_with_children = arguments.get("delete_with_children", False)
    # Convert boolean to lower-case string for query param
    param = "true" if delete_with_children else "false"
    data = await pyrus_client.delete(f"/knowledgebase/{kb_id}?delete_with_children={param}")
    return [TextContent(type="text", text=json.dumps(data))]


