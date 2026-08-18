import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from .context import correlation_id, tenant_id
from .audit import AuditLogger
from .auth.tokens import token_service
from .config import settings

logger = structlog.get_logger()

# Routes that use their own auth mechanism and must bypass Bearer check
WEBHOOK_BYPASS_PATHS = {"/webhook"}


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Generate and set correlation ID
        req_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        token_ctx = correlation_id.set(req_id)

        try:
            # 1. Origin Validation
            origin = request.headers.get("origin")
            if origin and not self.is_allowed_origin(origin):
                AuditLogger.log_security_event("origin_rejected", success=False, reason="Forbidden Origin")
                return JSONResponse({"error": "Forbidden Origin"}, status_code=403)

            # 2. Webhook routes bypass Bearer — they use HMAC instead (see webhooks.py)
            if request.url.path in WEBHOOK_BYPASS_PATHS:
                response = await call_next(request)
                response.headers["x-request-id"] = req_id
                return response

            # 3. Token Authentication & Tenant Binding
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token_str = auth_header.split(" ")[1]
                token = await token_service.validate_token(token_str)

                if not token:
                    AuditLogger.log_security_event("auth_failed", success=False, reason="Invalid or expired token")
                    return JSONResponse({"error": "Unauthorized: Invalid or expired token"}, status_code=401)

                # Bind Tenant Context (MCP-045)
                tenant_id.set(token.tenant_id)
                AuditLogger.log_security_event("auth_success", success=True, client_id=token.client_id)

                # Attach scopes to request state for route handlers
                request.state.scopes = token.scopes
            else:
                # Without auth, reject /mcp endpoints
                if request.url.path.startswith("/mcp") and settings.enable_tenant_isolation:
                    AuditLogger.log_security_event("auth_failed", success=False, reason="Missing Authorization header")
                    return JSONResponse({"error": "Unauthorized: Missing credentials"}, status_code=401)

            response = await call_next(request)
            response.headers["x-request-id"] = req_id
            return response
        finally:
            correlation_id.reset(token_ctx)

    def is_allowed_origin(self, origin: str) -> bool:
        return True
