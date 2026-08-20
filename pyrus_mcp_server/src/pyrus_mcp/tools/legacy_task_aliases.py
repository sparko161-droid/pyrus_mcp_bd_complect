import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

def register_legacy_aliases():
    @tool_registry.register(
        name="assign_task",
        description="Reassign a task to another person. person is a dict with id or email.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "person": {
                    "type": "object",
                    "properties": {"id": {"type": "integer"}, "email": {"type": "string"}}
                }
            },
            "required": ["task_id", "person"]
        }
    )
    async def assign_task(arguments: dict) -> list[TextContent]:
        payload = {"reassign_to": arguments["person"]}
        data = await pyrus_client.post(f"/tasks/{arguments['task_id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="add_approvers",
        description="Add approvers to a task. approvers is an array of arrays of person dicts.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "approvers": {
                    "type": "array",
                    "items": {"type": "array", "items": {"type": "object"}}
                }
            },
            "required": ["task_id", "approvers"]
        }
    )
    async def add_approvers(arguments: dict) -> list[TextContent]:
        payload = {"approvals_added": arguments["approvers"]}
        data = await pyrus_client.post(f"/tasks/{arguments['task_id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="add_subscribers",
        description="Add subscribers to a task. subscribers is an array of person dicts.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "subscribers": {
                    "type": "array",
                    "items": {"type": "object"}
                }
            },
            "required": ["task_id", "subscribers"]
        }
    )
    async def add_subscribers(arguments: dict) -> list[TextContent]:
        payload = {"subscribers_added": arguments["subscribers"]}
        data = await pyrus_client.post(f"/tasks/{arguments['task_id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="close_task",
        description="Close a task, optionally with a comment.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "text": {"type": "string"}
            },
            "required": ["task_id"]
        }
    )
    async def close_task(arguments: dict) -> list[TextContent]:
        payload = {"action": "finished"}
        if "text" in arguments: payload["text"] = arguments["text"]
        data = await pyrus_client.post(f"/tasks/{arguments['task_id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="reopen_task",
        description="Reopen a task, optionally with a comment.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "text": {"type": "string"}
            },
            "required": ["task_id"]
        }
    )
    async def reopen_task(arguments: dict) -> list[TextContent]:
        payload = {"action": "reopened"}
        if "text" in arguments: payload["text"] = arguments["text"]
        data = await pyrus_client.post(f"/tasks/{arguments['task_id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="update_task_fields",
        description="Update fields of a task.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "fields": {"type": "array", "items": {"type": "object"}}
            },
            "required": ["task_id", "fields"]
        }
    )
    async def update_task_fields(arguments: dict) -> list[TextContent]:
        payload = {"field_updates": arguments["fields"]}
        data = await pyrus_client.post(f"/tasks/{arguments['task_id']}/comments", json=payload)
        return [TextContent(type="text", text=json.dumps(data))]

register_legacy_aliases()
