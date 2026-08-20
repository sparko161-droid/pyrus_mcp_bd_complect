import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

@tool_registry.register(
    name="get_kb_object",
    description="Returns the content and metadata of a Pyrus Knowledge Base object.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "integer", "description": "The ID of the KB object"}
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
    description="Creates a new object in the Pyrus Knowledge Base.",
    inputSchema={
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "content": {"type": "string", "description": "Markdown content"},
            "parent_id": {"type": "integer", "description": "Optional parent folder ID"}
        },
        "required": ["title", "content"]
    }
)
async def create_kb_object(arguments: dict) -> list[TextContent]:
    payload = {"title": arguments["title"], "content": arguments["content"]}
    if "parent_id" in arguments:
        payload["parent_id"] = arguments["parent_id"]
    data = await pyrus_client.post("/knowledgebase", json=payload)
    return [TextContent(type="text", text=json.dumps(data))]

@tool_registry.register(
    name="update_kb_object",
    description="Updates an existing Pyrus Knowledge Base object.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "integer"},
            "title": {"type": "string"},
            "content": {"type": "string"}
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
    description="Returns the tree structure of the Pyrus Knowledge Base.",
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
    description="Returns the permissions of a Pyrus Knowledge Base object.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "integer"}
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
    description="Updates the permissions of a Pyrus Knowledge Base object.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "integer"},
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
    description="Deletes a Pyrus Knowledge Base object.",
    inputSchema={
        "type": "object",
        "properties": {
            "kb_id": {"type": "integer"},
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
