import inspect
from typing import Callable, Dict, Any, List
from mcp.types import Tool
from pydantic import BaseModel

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
        self.handlers: Dict[str, Callable] = {}

    def register(self, name: str, description: str, inputSchema: dict):
        def decorator(func: Callable):
            self.tools[name] = Tool(name=name, description=description, inputSchema=inputSchema)
            self.handlers[name] = func
            return func
        return decorator

    def get_tool_list(self) -> List[Tool]:
        return list(self.tools.values())

    async def call(self, name: str, arguments: dict) -> list[Any]:
        if name not in self.handlers:
            raise ValueError(f"Tool {name} is not registered")
        return await self.handlers[name](arguments)

# Global router for read-only tools
readonly_router = ToolRegistry()
