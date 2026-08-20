from typing import List, Dict, Any
from mcp.server.fastmcp import FastMCP
from .tools import (
    get_organizations,
    get_nomenclature,
    get_menu,
    get_terminals,
    get_orders,
    create_webhook,
    get_webhooks,
)

mcp = FastMCP("iiko")

@mcp.tool()
async def fetch_organizations() -> List[Dict[str, Any]]:
    """Fetch the list of available organizations."""
    orgs = await get_organizations()
    return [org.model_dump() for org in orgs]

@mcp.tool()
async def fetch_nomenclature(organization_id: str) -> List[Dict[str, Any]]:
    """Fetch the nomenclature for a given organization."""
    items = await get_nomenclature(organization_id)
    return [item.model_dump() for item in items]

@mcp.tool()
async def fetch_menu(organization_id: str) -> List[Dict[str, Any]]:
    """Fetch the menu for a given organization."""
    menus = await get_menu(organization_id)
    return [menu.model_dump() for menu in menus]

@mcp.tool()
async def fetch_terminals(organization_id: str) -> List[Dict[str, Any]]:
    """Fetch the terminals for a given organization."""
    terminals = await get_terminals(organization_id)
    return [term.model_dump() for term in terminals]

@mcp.tool()
async def fetch_orders(organization_id: str, order_ids: List[str]) -> List[Dict[str, Any]]:
    """Fetch orders by IDs for a given organization."""
    orders = await get_orders(organization_id, order_ids)
    return [order.model_dump() for order in orders]

@mcp.tool()
async def setup_webhook(organization_id: str, web_hook_uri: str, event_type: str) -> Dict[str, Any]:
    """Create a webhook for iiko events."""
    return await create_webhook(organization_id, web_hook_uri, event_type)

@mcp.tool()
async def fetch_webhooks(organization_id: str) -> Dict[str, Any]:
    """Retrieve current webhooks settings."""
    return await get_webhooks(organization_id)

if __name__ == "__main__":
    mcp.run()
