import json
from mcp.types import TextContent
from .registry import readonly_router
from ..pyrus.client import pyrus_client
from ..models.domain.tasks import Task

@readonly_router.register(
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

@readonly_router.register(
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
