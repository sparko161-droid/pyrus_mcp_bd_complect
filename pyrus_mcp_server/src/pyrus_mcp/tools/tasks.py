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
            "text": {"type": "string", "description": "The task text or description"},
            "form_id": {"type": "integer", "description": "Optional form ID to use (if creating a form task)"},
            "fields": {
                "type": "array",
                "description": "List of field values to set when creating a form task. Each field must have an id or name, and a value.",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer", "description": "Field ID"},
                        "name": {"type": "string", "description": "Field Name (alternative to ID)"},
                        "value": {"description": "Field value. Can be a string, number, or array for multiple choice/tables."}
                    }
                }
            },
            "participants": {
                "type": "array", 
                "description": "List of participants to add",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer", "description": "Person ID"},
                        "email": {"type": "string", "description": "Person email"}
                    }
                }
            },
            "due_date": {"type": "string", "description": "Due date in YYYY-MM-DD format"},
            "due": {"type": "string", "description": "Due date and time in YYYY-MM-DDTHH:MM:SSZ format"},
            "attachments": {"type": "array", "items": {"type": "string", "description": "List of file GUIDs uploaded via upload_file tool"}},
            "subject": {"type": "string", "description": "Subject of the task"},
            "parent_task_id": {"type": "integer", "description": "ID of parent task if creating a subtask"},
            "list_ids": {"type": "array", "items": {"type": "integer"}, "description": "List IDs to add this task to"}
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
            "action": {"type": "string", "enum": ["finished", "reopened"], "description": "Action to perform on the task"},
            "approval_choice": {"type": "string", "enum": ["approved", "rejected", "acknowledged"], "description": "Approval decision"},
            "field_updates": {
                "type": "array",
                "description": "List of field values to update. Each field must have an id or name, and a value.",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer", "description": "Field ID"},
                        "name": {"type": "string", "description": "Field Name (alternative to ID)"},
                        "value": {"description": "Field value. Can be a string, number, or array for multiple choice/tables."}
                    }
                }
            },
            "reassign_to": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "email": {"type": "string"}
                }
            },
            "subscribers_added": {
                "type": "array", 
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "email": {"type": "string"}
                    }
                }
            },
            "subscribers_removed": {
                "type": "array", 
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "email": {"type": "string"}
                    }
                }
            },
            "due_date": {"type": "string", "description": "Due date in YYYY-MM-DD format"},
            "due": {"type": "string", "description": "Due date and time in YYYY-MM-DDTHH:MM:SSZ format"},
            "attachments": {"type": "array", "items": {"type": "string", "description": "List of file GUIDs uploaded via upload_file tool"}}
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




