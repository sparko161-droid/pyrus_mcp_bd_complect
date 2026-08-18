from typing import Dict, Optional
from pyrus_mcp.models.identity import Client

class ClientRegistry:
    def __init__(self):
        # In-memory mock for Phase 4. In production this could be Redis or a DB.
        self._clients: Dict[str, Client] = {}

    def register_client(self, client: Client) -> None:
        self._clients[client.id] = client

    def get_client(self, client_id: str) -> Optional[Client]:
        client = self._clients.get(client_id)
        if client and client.is_active:
            return client
        return None

# Global registry instance
client_registry = ClientRegistry()
