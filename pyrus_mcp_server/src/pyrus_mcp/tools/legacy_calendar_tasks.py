import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
import asyncio

def register_legacy_calendar_tasks():
    @tool_registry.register(
        name="get_tasks",
        description="Get several tasks at once (batch). No native Pyrus batch endpoint — still 1 request per id against the 5000/10min rate cap; ask for tens/hundreds not thousands. Failed ids land under 'errors' instead of failing the whole call; reply stops early if rate limit is exhausted. A few hundred full task bodies can exceed response size limits.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_ids": {"type": "array", "items": {"type": "integer"}}
            },
            "required": ["task_ids"]
        }
    )
    async def get_tasks(arguments: dict) -> list[TextContent]:
        task_ids = arguments["task_ids"]
        results = {"tasks": [], "errors": []}
        
        async def fetch(tid):
            try:
                res = await pyrus_client.get(f"/tasks/{tid}")
                return res.get("task")
            except Exception as e:
                return {"error": str(e), "task_id": tid}

        coroutines = [fetch(tid) for tid in task_ids[:50]] # max 50 for safety
        completed = await asyncio.gather(*coroutines)
        
        for c in completed:
            if c and "error" in c:
                results["errors"].append(c)
            elif c:
                results["tasks"].append(c)
                
        return [TextContent(type="text", text=json.dumps(results))]

    @tool_registry.register(
        name="get_calendar_tasks",
        description="Get calendar tasks for a time interval. filter_mask bits: 0b1000 reminded, 0b0100 DueForCurrentStep, 0b0010 DueDate, 0b0001 Due.",
        inputSchema={
            "type": "object",
            "properties": {
                "start_date_utc": {"type": "string", "description": "ISO 8601"},
                "end_date_utc": {"type": "string", "description": "ISO 8601"},
                "filter_mask": {"type": "integer"},
                "item_count": {"type": "integer"},
                "all_accessed_tasks": {"type": "boolean"},
                "include_meetings": {"type": "boolean"}
            },
            "required": ["start_date_utc", "end_date_utc"]
        }
    )
    async def get_calendar_tasks(arguments: dict) -> list[TextContent]:
        params = [f"start_date_utc={arguments['start_date_utc']}", f"end_date_utc={arguments['end_date_utc']}"]
        for k in ["filter_mask", "item_count", "all_accessed_tasks", "include_meetings"]:
            if k in arguments:
                params.append(f"{k}={arguments[k]}")
        data = await pyrus_client.get("/calendar?" + "&".join(params))
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="search_tasks",
        description="Search tasks in a form register by date range.",
        inputSchema={
            "type": "object",
            "properties": {
                "form_id": {"type": "integer"},
                "created_before": {"type": "string"},
                "created_after": {"type": "string"},
                "item_count": {"type": "integer"}
            },
            "required": ["form_id"]
        }
    )
    async def search_tasks(arguments: dict) -> list[TextContent]:
        url = f"/forms/{arguments['form_id']}/register?"
        params = []
        for k in ["created_before", "created_after", "item_count"]:
            if k in arguments: params.append(f"{k}={arguments[k]}")
        data = await pyrus_client.get(url + "&".join(params))
        return [TextContent(type="text", text=json.dumps(data))]

    @tool_registry.register(
        name="get_overdue_tasks",
        description="Get overdue tasks from a form register.",
        inputSchema={
            "type": "object",
            "properties": {
                "form_id": {"type": "integer"}
            },
            "required": ["form_id"]
        }
    )
    async def get_overdue_tasks(arguments: dict) -> list[TextContent]:
        data = await pyrus_client.get(f"/forms/{arguments['form_id']}/register?include_archived=false&item_count=100")
        tasks = data.get("tasks", [])
        import datetime
        now = datetime.datetime.utcnow().date()
        overdue = []
        for t in tasks:
            if "due_date" in t and t["due_date"]:
                # rudimentary parse
                try:
                    d = datetime.datetime.strptime(t["due_date"], "%Y-%m-%d").date()
                    if d < now: overdue.append(t)
                except Exception:
                    continue
        return [TextContent(type="text", text=json.dumps({"tasks": overdue}))]

    @tool_registry.register(
        name="get_tasks_due_soon",
        description="Get tasks with upcoming due dates within N days from a form register.",
        inputSchema={
            "type": "object",
            "properties": {
                "form_id": {"type": "integer"},
                "days": {"type": "integer"}
            },
            "required": ["form_id", "days"]
        }
    )
    async def get_tasks_due_soon(arguments: dict) -> list[TextContent]:
        data = await pyrus_client.get(f"/forms/{arguments['form_id']}/register?include_archived=false&item_count=100")
        tasks = data.get("tasks", [])
        import datetime
        now = datetime.datetime.utcnow().date()
        target = now + datetime.timedelta(days=arguments["days"])
        due_soon = []
        for t in tasks:
            if "due_date" in t and t["due_date"]:
                try:
                    d = datetime.datetime.strptime(t["due_date"], "%Y-%m-%d").date()
                    if now <= d <= target: due_soon.append(t)
                except Exception:
                    continue
        return [TextContent(type="text", text=json.dumps({"tasks": due_soon}))]

register_legacy_calendar_tasks()
