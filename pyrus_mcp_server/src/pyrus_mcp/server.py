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

async def health_check(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "healthy",
        "version": "1.0.0",
        "service": "pyrus-mcp"
    })

async def readiness_check(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ready",
        "version": "1.0.0",
        "database": "connected"
    })

class AcceptHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Force Accept: application/json for MCP paths if missing/wildcard
        if request.url.path not in {"/health", "/ready", "/metrics", "/webhook"}:
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

from .metrics import metrics_endpoint
from .webhooks import webhook_handler

def create_app() -> Starlette:
    mcp_srv = Server("pyrus-mcp")
    register_tools(mcp_srv)

    mgr = StreamableHTTPSessionManager(
        mcp_srv,
        json_response=True,
        stateless=settings.mcp_stateless
    )

    @asynccontextmanager
    async def lifespan(application: Starlette):
        async with mgr.run():
            yield

    app_instance = Starlette(
        routes=[
            Route("/health", endpoint=health_check, methods=["GET"]),
            Route("/ready", endpoint=readiness_check, methods=["GET"]),
            Route("/metrics", endpoint=metrics_endpoint, methods=["GET"]),
            Route("/webhook", endpoint=webhook_handler, methods=["POST"]),
            Mount("/mcp", app=mgr.handle_request),
            Mount("/", app=mgr.handle_request),
        ],
        lifespan=lifespan
    )

    cors_kwargs = {
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if settings.cors_allow_all:
        cors_kwargs["allow_origins"] = ["*"]
        cors_kwargs["allow_credentials"] = False
    else:
        cors_kwargs["allow_origins"] = settings.cors_origins
        cors_kwargs["allow_credentials"] = True

    app_instance.add_middleware(AcceptHeaderMiddleware)
    app_instance.add_middleware(CORSMiddleware, **cors_kwargs)
    app_instance.add_middleware(SecurityMiddleware)
    return app_instance

app = create_app()

def main() -> None:
    logger.info("Starting MCP Server", stateless=settings.mcp_stateless, host=settings.host, port=settings.port)
    uvicorn.run("pyrus_mcp.server:create_app", factory=True, host=settings.host, port=settings.port)

if __name__ == "__main__":
    main()
