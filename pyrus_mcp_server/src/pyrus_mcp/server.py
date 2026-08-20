import os
import structlog
from contextlib import asynccontextmanager
from starlette.applications import Starlette
from starlette.routing import Mount, Route
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
import uvicorn
from mcp.server import Server
from .config import settings
from .middleware import SecurityMiddleware
from .tools import register_tools
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

logger = structlog.get_logger()

mcp_server = Server("pyrus-mcp")
register_tools(mcp_server)

session_manager = StreamableHTTPSessionManager(mcp_server, json_response=True, stateless=True)

class AcceptHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Force Accept: application/json so StreamableHTTPSessionManager doesn't reject it
        if "accept" not in request.headers or "*/*" in request.headers["accept"]:
            mutable_headers = request.headers.mutablecopy()
            mutable_headers["accept"] = "application/json"
            request.scope["headers"] = mutable_headers.raw
        
        if request.method == "POST":
            ctype = request.headers.get("content-type", "")
            if not ctype or "application/json" not in ctype:
                mutable_headers = request.headers.mutablecopy()
                mutable_headers["content-type"] = "application/json"
                request.scope["headers"] = mutable_headers.raw

        return await call_next(request)

@asynccontextmanager
async def lifespan(app: Starlette):
    async with session_manager.run():
        yield

# Just Mount at root! It will intercept everything and we avoid the 307 trailing slash redirect for /mcp
app = Starlette(
    routes=[
        Mount("/", app=session_manager.handle_request),
    ],
    lifespan=lifespan
)

app.add_middleware(AcceptHeaderMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(SecurityMiddleware)

def main() -> None:
    logger.info("Starting MCP Server with Root Mount")
    uvicorn.run(app, host=settings.host, port=settings.port)

if __name__ == "__main__":
    main()
