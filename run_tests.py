import asyncio
import json
import sys

from pyrus_mcp.pyrus.auth import pyrus_auth
from pyrus_mcp.tools.registry import tool_registry

# Import all tool modules so they register
import pyrus_mcp.tools.members
import pyrus_mcp.tools.catalogs
import pyrus_mcp.tools.forms
import pyrus_mcp.tools.tasks
import pyrus_mcp.tools.misc
import pyrus_mcp.tools.pyrus_kb

async def test_tool(name, args):
    print(f"\n--- Testing {name} ---")
    try:
        handler = tool_registry.get_tool(name)
        result = await handler(args)
        text_out = result[0].text
        
        # Try parse JSON
        try:
            parsed = json.loads(text_out)
            # If it's a list, print length
            if isinstance(parsed, list):
                print(f"SUCCESS: Returned {len(parsed)} items.")
                print(f"Sample: {json.dumps(parsed[:1], indent=2, ensure_ascii=False)[:300]}")
            elif isinstance(parsed, dict):
                print(f"SUCCESS: Returned dict with keys: {list(parsed.keys())}")
                print(f"Sample: {json.dumps(parsed, indent=2, ensure_ascii=False)[:300]}")
            else:
                print(f"SUCCESS: {text_out[:300]}")
        except:
            print(f"SUCCESS (raw text): {text_out[:300]}")
            
    except Exception as e:
        print(f"ERROR: {str(e)}")

async def main():
    print("Testing tools directly...")
    
    # 1. Forms
    await test_tool("get_forms", {})
    await test_tool("get_form", {"form_id": 2371445}) # CRM
    
    # 2. Registry
    await test_tool("get_registry", {"form_id": 2371445, "item_count": 2})
    
    # 3. Tasks
    # We will get task ID from registry
    handler = tool_registry.get_tool("get_registry")
    res = await handler({"form_id": 2371445, "item_count": 1})
    task_id = json.loads(res[0].text)[0]["id"]
    await test_tool("get_task", {"task_id": task_id})
    
    # 4. Catalogs
    await test_tool("get_catalogs", {})
    
    # 5. Members
    await test_tool("get_members", {})
    await test_tool("get_roles", {})
    
    # 6. Misc
    await test_tool("get_announcements", {})
    
    # 7. Knowledge Base (Let's fetch structure)
    await test_tool("get_kb_structure", {})

if __name__ == '__main__':
    asyncio.run(main())
