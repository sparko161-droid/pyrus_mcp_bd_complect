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
            },
            "participants": {"type": "array", "items": {"type": "object"}},
            "due_date": {"type": "string"},
            "due": {"type": "string"},
            "attachments": {"type": "array", "items": {"type": "string"}},
            "subject": {"type": "string"},
            "parent_task_id": {"type": "integer"},
            "list_ids": {"type": "array", "items": {"type": "integer"}}
        },
        "required": ["text"]
    }
)
async def create_task(arguments: dict) -> list[TextContent]:
    payload = {"text": arguments["text"]}
    for field in ["form_id", "fields", "participants", "due_date", "due", "attachments", "subject", "parent_task_id", "list_ids"]:
        if field in arguments:
            payload[field] = arguments[field]
            
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
            "approval_choice": {"type": "string", "enum": ["approved", "rejected", "acknowledged"]},
            "field_updates": {"type": "array", "items": {"type": "object"}},
            "reassign_to": {"type": "object"},
            "subscribers_added": {"type": "array"},
            "subscribers_removed": {"type": "array"},
            "due_date": {"type": "string"},
            "due": {"type": "string"},
            "attachments": {"type": "array", "items": {"type": "string"}},
            "scheduled_date": {"type": "string"},
            "subject": {"type": "string"}
        },
        "required": ["task_id"]
    }
)
async def add_comment(arguments: dict) -> list[TextContent]:
    payload = arguments.copy()
    task_id = payload.pop("task_id")
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
    import asyncio
    task_ids = arguments["task_ids"]
    fields = arguments.get("fields", [])
    comment_text = arguments.get("comment_text", "")
    
    results = {"success": [], "failed": []}
    
    async def _update_task(task_id):
        payload = {}
        if fields: payload["field_updates"] = fields
        if comment_text: payload["text"] = comment_text
        await pyrus_client.post(f"/tasks/{task_id}/comments", json=payload)
        return task_id

    coroutines = [_update_task(tid) for tid in task_ids]
    completed = await asyncio.gather(*coroutines, return_exceptions=True)
    
    for i, res in enumerate(completed):
        if isinstance(res, Exception):
            results["failed"].append({"task_id": task_ids[i], "error": str(res)})
        else:
            results["success"].append(res)
            
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
    import asyncio
    task_ids = arguments["task_ids"]
    comment_text = arguments.get("comment_text", "Closed automatically by MCP Agent")
    
    results = {"success": [], "failed": [], "skipped_already_closed": []}
    
    async def _close_task(task_id):
        # Idempotency check: is it already closed?
        task_data = await pyrus_client.get(f"/tasks/{task_id}")
        if task_data.get("task", {}).get("is_closed", False):
            return {"task_id": task_id, "status": "skipped"}
        
        payload = {"action": "finished", "text": comment_text}
        await pyrus_client.post(f"/tasks/{task_id}/comments", json=payload)
        return {"task_id": task_id, "status": "success"}

    coroutines = [_close_task(tid) for tid in task_ids]
    completed = await asyncio.gather(*coroutines, return_exceptions=True)
    
    for i, res in enumerate(completed):
        if isinstance(res, Exception):
            results["failed"].append({"task_id": task_ids[i], "error": str(res)})
        elif res["status"] == "skipped":
            results["skipped_already_closed"].append(res["task_id"])
        else:
            results["success"].append(res["task_id"])
            
    return [TextContent(type="text", text=json.dumps(results))]


