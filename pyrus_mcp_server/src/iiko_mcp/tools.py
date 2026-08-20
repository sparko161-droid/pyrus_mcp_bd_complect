from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from .client import iiko_client
from .config import iiko_settings

# -- Domain Models --

class Organization(BaseModel):
    id: str
    name: str

class NomenclatureItem(BaseModel):
    id: str
    name: str
    price: float

class Menu(BaseModel):
    id: str
    name: str
    items: List[NomenclatureItem]

class Terminal(BaseModel):
    id: str
    name: str
    organizationId: str

class Order(BaseModel):
    id: str
    organizationId: str
    items: List[Dict[str, Any]]
    status: str

# -- Methods --

async def get_organizations() -> List[Organization]:
    """
    Fetch the list of available organizations.
    """
    response = await iiko_client.post("/organizations")
    orgs = response.get("organizations", [])
    return [Organization(**org) for org in orgs]

async def get_nomenclature(organization_id: str) -> List[NomenclatureItem]:
    """
    Fetch the nomenclature for a given organization.
    """
    response = await iiko_client.post("/nomenclature", json={"organizationId": organization_id})
    items = response.get("products", [])
    return [NomenclatureItem(**item) for item in items]

async def get_menu(organization_id: str) -> List[Menu]:
    """
    Fetch the menu for a given organization.
    """
    response = await iiko_client.post("/menu", json={"organizationId": organization_id})
    menus = response.get("externalMenus", [])
    return [Menu(**m) for m in menus]

async def get_terminals(organization_id: str) -> List[Terminal]:
    """
    Fetch the terminals for a given organization.
    """
    response = await iiko_client.post("/terminals", json={"organizationIds": [organization_id]})
    terminals_data = response.get("terminals", [])
    result = []
    for group in terminals_data:
        if group.get("organizationId") == organization_id:
            for term in group.get("items", []):
                result.append(Terminal(**term))
    return result

async def get_orders(organization_id: str, order_ids: List[str]) -> List[Order]:
    """
    Fetch orders by IDs for a given organization.
    """
    response = await iiko_client.post("/orders/by_id", json={
        "organizationIds": [organization_id],
        "orderIds": order_ids
    })
    orders_data = response.get("orders", [])
    return [Order(**o) for o in orders_data]

async def create_webhook(organization_id: str, web_hook_uri: str, event_type: str) -> Dict[str, Any]:
    """
    Create a webhook for iiko events.
    """
    payload = {
        "organizationId": organization_id,
        "webHookUri": web_hook_uri,
        "settings": {
            "eventTypes": [event_type]
        }
    }
    
    auth_token = getattr(iiko_settings, "webhook_auth_token", None)
    if auth_token:
        payload["authToken"] = auth_token

    response = await iiko_client.post("/webhooks/update", json=payload)
    return response

async def get_webhooks(organization_id: str) -> Dict[str, Any]:
    """
    Retrieve current webhooks settings.
    """
    response = await iiko_client.post("/webhooks/settings", json={"organizationId": organization_id})
    return response
