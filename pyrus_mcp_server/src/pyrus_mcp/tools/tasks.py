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
            "task_id": {"type": "integer", "description": "The task ID"}
        },
        "required": ["task_id"]
    }
)
async def get_task(arguments: dict) -> list[TextContent]:
    task_id = arguments.get("task_id") or arguments.get("id")
    data = await pyrus_client.get(f"/tasks/{task_id}")
    task = Task(**data.get("task", {}))
    return [TextContent(type="text", text=task.model_dump_json())]

@tool_registry.register(
    name="create_task",
    description="Create a new task. Pass either text (simple task) or form_id (form task). responsible/participants/subscribers are person dicts (id/email/first_name/last_name). fields are dicts (id/name/type/value/code). approvals is list of lists of person dicts. attachments is list of uploaded file GUIDs.",
    inputSchema={
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "Text of the task"},
            "form_id": {"type": "integer", "description": "Form template ID"},
            "fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "name": {"type": "string"},
                        "value": {"type": ["string", "number", "array"]}
                    }
                }
            },
            "participants": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "email": {"type": "string"}
                    }
                }
            },
            "due_date": {"type": "string"},
            "due": {"type": "string"},
            "attachments": {"type": "array", "items": {"type": "string"}},
            "subject": {"type": "string"},
            "parent_task_id": {"type": "integer"},
            "list_ids": {"type": "array", "items": {"type": "integer"}}
        },
        "required": []
    }
)
async def create_task(arguments: dict) -> list[TextContent]:
    payload = {}
    if "text" in arguments and arguments["text"]:
        payload["text"] = arguments["text"]
    for field in ["form_id", "fields", "participants", "due_date", "due", "attachments", "subject", "parent_task_id", "list_ids", "responsible", "subscribers", "approvals"]:
        if field in arguments:
            payload[field] = arguments[field]
            
    data = await pyrus_client.post("/tasks", json=payload)
    task = Task(**data.get("task", {}))
    return [TextContent(type="text", text=task.model_dump_json())]

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
    return [TextContent(type="text", text=task.model_dump_json())]

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






@tool_registry.register(
    name="get_registry",
    description="Get tasks register for a form template. IMPORTANT: by default returns only OPEN tasks; pass include_archived=true for full history/counts (closed set = full minus open, no is_closed field exists). field_filters keys must be the field's NUMERIC id (not name/code) e.g. {\"6\": 958621}; unrecognized keys are silently ignored by Pyrus (non-numeric keys rejected locally). steps filters by workflow current_step, not a form field. Registers can be very large (measured 16MB/year for one form) — use field_ids to narrow columns, item_count to cap rows, created_after/created_before to shorten period; oversized results are refused with guidance rather than silently truncated. To page a large register, walk by date windows (created_after/created_before) since there is no offset/cursor.",
    inputSchema={
        "type": "object",
        "properties": {
            "form_id": {"type": "integer", "description": "The ID of the form template"},
            "item_count": {"type": "integer", "description": "Limit returned tasks"},
            "include_archived": {"type": "boolean", "description": "Include closed tasks (default false)"},
            "created_before": {"type": "string", "description": "YYYY-MM-DD"},
            "created_after": {"type": "string", "description": "YYYY-MM-DD"}
        },
        "required": ["form_id"]
    }
)
async def get_registry(arguments: dict) -> list[TextContent]:
    form_id = arguments.pop("form_id")
    url = f"/forms/{form_id}/register"
    params = []
    for k, v in arguments.items():
        if v is not None:
            params.append(f"{k}={v}")
    if params:
        url += "?" + "&".join(params)
        
    data = await pyrus_client.get(url)
    return [TextContent(type="text", text=json.dumps(data))]

