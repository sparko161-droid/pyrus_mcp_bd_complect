import sys
import structlog
from typing import Any
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import InitializationOptions

from .config import settings
from .middleware import SecurityMiddleware
from .context import correlation_id

logger = structlog.get_logger()

from contextlib import asynccontextmanager

from .tools import register_tools
from .webhooks import webhook_handler
from . import db


@asynccontextmanager
async def lifespan(app):
    """Open DB + run migrations on startup; close on shutdown."""
    await db.open()
    await db.run_migrations()
    logger.info("DB ready, server starting up")
    yield
    await db.close()
    logger.info("Server shut down cleanly")

# MCP Server Definition
# We use the low-level Server from the official MCP SDK to have full control over the Starlette app
server = Server("pyrus-mcp-server")

# Register All Tools
register_tools(server)

# SSE Transport Endpoint
sse_transport: SseServerTransport | None = None

async def handle_sse(request):
    global sse_transport
    sse_transport = SseServerTransport("/mcp/messages")
    async def process_messages():
        await server.run(
            sse_transport,
            server.create_initialization_options()
        )
    
    # We run the MCP server loop in the background while returning the SSE response
    import asyncio
    asyncio.create_task(process_messages())
    return await sse_transport.handle_sse(request)

async def handle_messages(request):
    global sse_transport
    if sse_transport is None:
        return JSONResponse({"error": "SSE connection not established"}, status_code=400)
    await sse_transport.handle_post_message(request)
    return JSONResponse({"status": "accepted"}, status_code=202)

# Health Endpoints
async def health_check(request):
    return JSONResponse({
        "status": "up",
        "version": "0.1.0",
        "correlation_id": correlation_id.get()
    })

async def ready_check(request):
    return JSONResponse({"status": "ready"})

# Construct the HTTP App
app = Starlette(
    lifespan=lifespan,
    routes=[
        Route("/health", health_check, methods=["GET"]),
        Route("/ready", ready_check, methods=["GET"]),
        Route("/mcp", handle_sse, methods=["GET"]),
        Route("/mcp/messages", handle_messages, methods=["POST"]),
        Route("/webhook", webhook_handler, methods=["POST"]),
    ],
    middleware=[
        Middleware(SecurityMiddleware)
    ]
)

def main() -> None:
    import uvicorn
    logger.info("Starting Pyrus MCP Server", transport=settings.mcp_transport, host=settings.host, port=settings.port)
    
    if settings.mcp_transport == "sse":
        uvicorn.run(app, host=settings.host, port=settings.port)
    else:
        # For stdio, we use the standard transport
        from mcp.server.stdio import stdio_server
        import asyncio
        
        async def run_stdio():
            async with stdio_server() as (read_stream, write_stream):
                await server.run(read_stream, write_stream, server.create_initialization_options())
                
        asyncio.run(run_stdio())

if __name__ == "__main__":
    main()
