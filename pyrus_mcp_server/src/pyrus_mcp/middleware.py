import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from .context import correlation_id, tenant_id

logger = structlog.get_logger()

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Generate and set correlation ID
        req_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        token = correlation_id.set(req_id)
        
        try:
            # Origin Validation (Phase 3 requirement)
            origin = request.headers.get("origin")
            if origin and not self.is_allowed_origin(origin):
                logger.warning("Rejected request from unauthorized origin", origin=origin)
                return JSONResponse({"error": "Forbidden Origin"}, status_code=403)
            
            # Simple auth check (to be expanded in Phase 4)
            # For now, if authorization header exists, we mock binding a tenant
            auth = request.headers.get("authorization")
            if auth:
                tenant_id.set("tenant-from-auth-header")

            response = await call_next(request)
            response.headers["x-request-id"] = req_id
            return response
        finally:
            correlation_id.reset(token)

    def is_allowed_origin(self, origin: str) -> bool:
        # For this phase, allow everything or specifically configured domains
        return True
