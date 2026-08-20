import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client

def register_legacy_misc():
    @tool_registry.register(name="attach_files_to_field", description="Attach files to a task field.", inputSchema={"type": "object", "properties": {"task_id": {"type": "integer"}, "field_id": {"type": "integer"}, "attachments": {"type": "array", "items": {"type": "string"}}}, "required": ["task_id", "field_id", "attachments"]})
    async def attach_files_to_field(args: dict) -> list[TextContent]:
        payload = {"field_updates": [{"id": args["field_id"], "type": "file", "value": args["attachments"]}]}
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post(f"/tasks/{args['task_id']}/comments", json=payload)))]

    @tool_registry.register(name="attach_new_file_version", description="Attach a new file version to a task field.", inputSchema={"type": "object", "properties": {"task_id": {"type": "integer"}, "field_id": {"type": "integer"}, "attachment_id": {"type": "integer"}, "new_attachment": {"type": "string"}}, "required": ["task_id", "field_id", "attachment_id", "new_attachment"]})
    async def attach_new_file_version(args: dict) -> list[TextContent]:
        payload = {"field_updates": [{"id": args["field_id"], "type": "file", "value": [args["new_attachment"]], "attachment_id": args["attachment_id"]}]}
        return [TextContent(type="text", text=json.dumps(await pyrus_client.post(f"/tasks/{args['task_id']}/comments", json=payload)))]

    @tool_registry.register(name="delete_task", description="Delete a task.", inputSchema={"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]})
    async def delete_task(args: dict) -> list[TextContent]:
        # Pyrus does not support task deletion via API. Legacy MCP might have faked it or used close.
        # Wait, there's NO DELETE /tasks in Pyrus. We'll return an error just like old one might.
        return [TextContent(type="text", text=json.dumps({"error": "Pyrus API does not support deleting tasks."}))]

    @tool_registry.register(name="get_form_permissions", description="Get form permissions.", inputSchema={"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]})
    async def get_form_permissions(args: dict) -> list[TextContent]:
        return [TextContent(type="text", text=json.dumps(await pyrus_client.get(f"/forms/{args['id']}/permissions")))]

    @tool_registry.register(name="get_meetings", description="Get meetings.", inputSchema={"type": "object", "properties": {"start_date_utc": {"type": "string"}, "end_date_utc": {"type": "string"}, "item_count": {"type": "integer"}}, "required": ["start_date_utc", "end_date_utc"]})
    async def get_meetings(args: dict) -> list[TextContent]:
        # This was part of calendar in the legacy MCP
        params = [f"start_date_utc={args['start_date_utc']}", f"end_date_utc={args['end_date_utc']}", "include_meetings=true"]
        if "item_count" in args: params.append(f"item_count={args['item_count']}")
        data = await pyrus_client.get("/calendar?" + "&".join(params))
        meetings = [t for t in data.get("tasks", []) if getattr(t, "type", "") == "meeting" or "meeting" in str(t)]
        # We just return the calendar tasks and let the client filter if needed, as Pyrus /calendar returns all tasks
        return [TextContent(type="text", text=json.dumps(data))]

register_legacy_misc()
