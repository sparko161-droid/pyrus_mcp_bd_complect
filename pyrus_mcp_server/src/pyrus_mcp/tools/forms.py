import time
import json
from mcp.types import TextContent
from .registry import tool_registry
from ..pyrus.client import pyrus_client
from ..models.domain.forms import FormTemplate

# Simple in-memory cache for forms (TTL 1 hour)
_form_cache = {}
CACHE_TTL = 3600

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
    from ..pyrus.auth import pyrus_auth
    tenant_key = pyrus_auth.login
    cache_key = f"{tenant_key}:{form_id}"
    
    # Check cache
    now = time.time()
    if cache_key in _form_cache:
        cached_form, timestamp = _form_cache[cache_key]
        if now - timestamp < CACHE_TTL:
            return [TextContent(type="text", text=json.dumps(cached_form.model_dump()))]
            
    data = await pyrus_client.get(f"/forms/{form_id}")
    form = FormTemplate(**data)
    
    # Save to cache
    _form_cache[cache_key] = (form, now)
    
    return [TextContent(type="text", text=json.dumps(form.model_dump()))]

