import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
from ..models.domain.tasks import Task

@tool_registry.register(
    name="get_task",
    description="Returns the full details of a specific task by its ID, including all comments and fields.",
    inputSchema={
        "type": "object",
        "properties": {
            "task_id": {"type": "integer", "description": "The ID of the task to fetch"}
        },
        "required": ["task_id"]
    }
)
async def get_task(arguments: dict) -> list[TextContent]:
    task_id = arguments["task_id"]
    data = await pyrus_client.get(f"/tasks/{task_id}")
    task = Task(**data.get("task", {}))
    return [TextContent(type="text", text=json.dumps(task.model_dump()))]

@tool_registry.register(
    name="get_registry",
    description="Returns a list of tasks that belong to a specific form (registry).",
    inputSchema={
        "type": "object",
        "properties": {
            "form_id": {"type": "integer", "description": "The ID of the form to get tasks for"},
            "item_count": {"type": "integer", "description": "Number of items to return, max 20000", "default": 50}
        },
        "required": ["form_id"]
    }
)
async def get_registry(arguments: dict) -> list[TextContent]:
    form_id = arguments["form_id"]
    item_count = arguments.get("item_count", 50)
    data = await pyrus_client.get(f"/forms/{form_id}/register?item_count={item_count}")
    tasks = [Task(**t) for t in data.get("tasks", [])]
    return [TextContent(type="text", text=json.dumps([t.model_dump() for t in tasks]))]

@tool_registry.register(
    name="create_task",
    description="Creates a new task in Pyrus, optionally based on a form template.",
    inputSchema={
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "The task text or description"},
            "form_id": {"type": "integer", "description": "Optional form ID to use"},
            "fields": {
                "type": "array",
                "items": {"type": "object"}
            }
        },
        "required": ["text"]
    }
)
async def create_task(arguments: dict) -> list[TextContent]:
    payload = {"text": arguments["text"]}
    if "form_id" in arguments:
        payload["form_id"] = arguments["form_id"]
    if "fields" in arguments:
        payload["fields"] = arguments["fields"]
        
    data = await pyrus_client.post("/tasks", json=payload)
    task = Task(**data.get("task", {}))
    return [TextContent(type="text", text=json.dumps(task.model_dump()))]

@tool_registry.register(
    name="add_comment",
    description="Adds a comment, approval, or updates fields in an existing task.",
    inputSchema={
        "type": "object",
        "properties": {
            "task_id": {"type": "integer", "description": "The task ID"},
            "text": {"type": "string", "description": "Comment text"},
            "approval_choice": {"type": "string", "enum": ["approved", "rejected", "acknowledged"]}
        },
        "required": ["task_id"]
    }
)
async def add_comment(arguments: dict) -> list[TextContent]:
    task_id = arguments.pop("task_id")
    payload = arguments
    data = await pyrus_client.post(f"/tasks/{task_id}/comments", json=payload)
    task = Task(**data.get("task", {}))
    return [TextContent(type="text", text=json.dumps(task.model_dump()))]

@tool_registry.register(
    name="batch_update_tasks",
    description="Updates multiple tasks with the same fields at once.",
    inputSchema={
        "type": "object",
        "properties": {
            "task_ids": {"type": "array", "items": {"type": "integer"}},
            "fields": {"type": "array", "items": {"type": "object"}},
            "comment_text": {"type": "string"}
        },
        "required": ["task_ids"]
    }
)
async def batch_update_tasks(arguments: dict) -> list[TextContent]:
    task_ids = arguments["task_ids"]
    fields = arguments.get("fields", [])
    comment_text = arguments.get("comment_text", "")
    
    results = {"success": [], "failed": []}
    for task_id in task_ids:
        payload = {}
        if fields: payload["fields"] = fields
        if comment_text: payload["text"] = comment_text
        try:
            await pyrus_client.post(f"/tasks/{task_id}/comments", json=payload)
            results["success"].append(task_id)
        except Exception as e:
            results["failed"].append({"task_id": task_id, "error": str(e)})
            
    return [TextContent(type="text", text=json.dumps(results))]

@tool_registry.register(
    name="batch_close_tasks",
    description="Closes multiple tasks at once.",
    inputSchema={
        "type": "object",
        "properties": {
            "task_ids": {"type": "array", "items": {"type": "integer"}},
            "comment_text": {"type": "string", "description": "Optional closing comment"}
        },
        "required": ["task_ids"]
    }
)
async def batch_close_tasks(arguments: dict) -> list[TextContent]:
    task_ids = arguments["task_ids"]
    comment_text = arguments.get("comment_text", "Closed automatically by MCP Agent")
    
    results = {"success": [], "failed": []}
    for task_id in task_ids:
        payload = {"action": "finished", "text": comment_text}
        try:
            await pyrus_client.post(f"/tasks/{task_id}/comments", json=payload)
            results["success"].append(task_id)
        except Exception as e:
            results["failed"].append({"task_id": task_id, "error": str(e)})
            
    return [TextContent(type="text", text=json.dumps(results))]
