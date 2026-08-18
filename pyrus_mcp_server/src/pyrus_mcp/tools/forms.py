import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
from ..models.domain.forms import FormTemplate

@tool_registry.register(
    name="get_forms",
    description="Returns the list of all form templates available in the organization.",
    inputSchema={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def get_forms(arguments: dict) -> list[TextContent]:
    data = await pyrus_client.get("/forms")
    forms = [FormTemplate(**f) for f in data.get("forms", [])]
    return [TextContent(type="text", text=json.dumps([f.model_dump() for f in forms]))]

@tool_registry.register(
    name="get_form",
    description="Returns the detailed template of a specific form, including all its fields.",
    inputSchema={
        "type": "object",
        "properties": {
            "form_id": {"type": "integer", "description": "The ID of the form template"}
        },
        "required": ["form_id"]
    }
)
async def get_form(arguments: dict) -> list[TextContent]:
    form_id = arguments["form_id"]
    data = await pyrus_client.get(f"/forms/{form_id}")
    form = FormTemplate(**data)
    return [TextContent(type="text", text=json.dumps(form.model_dump()))]
