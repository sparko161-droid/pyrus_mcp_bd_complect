import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pyrus_mcp_server', 'src'))

from pyrus_mcp.pyrus.auth import pyrus_auth
from pyrus_mcp.tools.forms import get_forms

async def main():
    print("Testing Pyrus Auth...")
    try:
        token = await pyrus_auth.get_token()
        print(f"Auth Success! Token length: {len(token)}")
        print(f"API URL: {pyrus_auth.api_url}")
        print(f"Files URL: {pyrus_auth.files_url}")
        
        print("\nTesting get_forms...")
        res = await get_forms({})
        print(f"Forms Result: {res[0].text[:500]}...")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == '__main__':
    asyncio.run(main())
