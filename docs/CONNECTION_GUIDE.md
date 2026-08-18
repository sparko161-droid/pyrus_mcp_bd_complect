# Pyrus Enterprise MCP Server — Connection & Integration Guide

---

## 1. Connecting Claude Desktop

Claude Desktop connects to the Pyrus MCP Server via **SSE (Server-Sent Events)** or **Stdio**.

### 1.1 Configuration via SSE (Recommended for Docker / Hosted)
Edit your `claude_desktop_config.json`:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pyrus": {
      "url": "http://localhost:8000/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

### 1.2 Configuration via Local Python / Stdio
```json
{
  "mcpServers": {
    "pyrus": {
      "command": "uv",
      "args": [
        "--directory",
        "C:\\Users\\Kuvshinov\\Desktop\\Работа\\antigravity\\sm2\\pyrus_mcp_bd_complect\\pyrus_mcp_server",
        "run",
        "pyrus-mcp"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "PYRUS_LOGIN": "your_bot@domain.com",
        "PYRUS_SECURITY_KEY": "your_security_key",
        "PYRUS_WEBHOOK_SECRET": "your_webhook_secret"
      }
    }
  }
}
```

---

## 2. Connecting Cursor IDE

In Cursor:
1. Navigate to **Settings** -> **Features** -> **MCP Servers**.
2. Click **+ Add New MCP Server**.
3. Configure the server:
   - **Name:** `pyrus`
   - **Type:** `sse`
   - **Server URL:** `http://localhost:8000/mcp`
   - **Headers:** `{"Authorization": "Bearer <YOUR_TOKEN>"}`

---

## 3. Connecting via Python MCP SDK

```python
import asyncio
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

async def main():
    headers = {"Authorization": "Bearer <YOUR_TOKEN>"}
    async with sse_client("http://localhost:8000/mcp", headers=headers) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            
            # List available tools
            tools = await session.list_tools()
            print(f"Connected! Available tools: {[t.name for t in tools.tools]}")
            
            # Call get_task
            result = await session.call_tool("get_task", arguments={"task_id": 12345})
            print("Task response:", result.content[0].text)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 4. Issuing Client Tokens for AI Agents
To issue an active Bearer token for an AI agent:
1. Connect to the SQLite database or execute the Python CLI:
```python
from pyrus_mcp.models.identity import Client
from pyrus_mcp.auth.registry import client_registry
from pyrus_mcp.auth.tokens import token_service
import asyncio

async def generate_token():
    agent = Client(
        id="agent-claude",
        name="Claude Desktop Agent",
        tenant_id="tenant-main",
        allowed_scopes=["tasks:read", "tasks:write", "knowledge:read", "knowledge:write"]
    )
    client_registry.register_client(agent)
    token = token_service.issue_token(agent)
    print("New Bearer Token:", token.token)

asyncio.run(generate_token())
```
