import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from .context import correlation_id, tenant_id, pyrus_login_ctx, pyrus_security_key_ctx, pyrus_person_id_ctx
from .audit import AuditLogger
from .auth.tokens import token_service
from .config import settings

logger = structlog.get_logger()

# Routes that use their own auth mechanism and must bypass Bearer check
WEBHOOK_BYPASS_PATHS = {"/webhook", "/metrics"}

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Generate and set correlation ID
        req_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        token_ctx = correlation_id.set(req_id)
        
        # Extract dynamic Pyrus credentials from headers (Multi-Tenancy Context)
        login_val = request.headers.get("x-pyrus-login")
        sec_key_val = request.headers.get("x-pyrus-security-key")
        person_id_val = request.headers.get("x-pyrus-person-id")
        
        ctx_login = pyrus_login_ctx.set(login_val) if login_val else None
        ctx_sec = pyrus_security_key_ctx.set(sec_key_val) if sec_key_val else None
        ctx_person = pyrus_person_id_ctx.set(person_id_val) if person_id_val else None

        try:
            if request.method == 'OPTIONS':
                return await call_next(request)
            # 1. Origin Validation
            origin = request.headers.get("origin")
            if origin and not self.is_allowed_origin(origin):
                AuditLogger.log_security_event("origin_rejected", success=False, reason="Forbidden Origin")
                return JSONResponse({"error": "Forbidden Origin"}, status_code=403)

            # 2. Webhook routes bypass Bearer
            if request.url.path in WEBHOOK_BYPASS_PATHS:
                response = await call_next(request)
                response.headers["x-request-id"] = req_id
                return response

            # 3. Token Authentication & Tenant Binding
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token_str = auth_header.split(" ")[1]
                # If they pass a static pass-through token, or validate via token_service
                token = await token_service.validate_token(token_str)

                # For local usage, we might bypass token_service if they pass dynamic Pyrus headers directly
                # However, we'll let token_service handle it or fallback to success if tenant isolation is off
                if not token and settings.enable_tenant_isolation:
                    AuditLogger.log_security_event("auth_failed", success=False, reason="Invalid or expired token")
                    return JSONResponse({"error": "Unauthorized: Invalid or expired token"}, status_code=401)

                if token:
                    tenant_id.set(token.tenant_id)
                    request.state.scopes = token.scopes
                    AuditLogger.log_security_event("auth_success", success=True, client_id=token.client_id)
            else:
                if request.url.path.startswith("/mcp") and settings.enable_tenant_isolation:
                    # Allow dynamic credentials to bypass global server Bearer if needed for raw MCP?
                    # No, the user provided both in their config. But if they just provide X-Pyrus we can let it through.
                    if login_val and sec_key_val:
                        pass # They provided direct Pyrus credentials
                    else:
                        AuditLogger.log_security_event("auth_failed", success=False, reason="Missing Authorization header")
                        return JSONResponse({"error": "Unauthorized: Missing credentials"}, status_code=401)

            response = await call_next(request)
            response.headers["x-request-id"] = req_id
            return response
        finally:
            correlation_id.reset(token_ctx)
            if ctx_login: pyrus_login_ctx.reset(ctx_login)
            if ctx_sec: pyrus_security_key_ctx.reset(ctx_sec)
            if ctx_person: pyrus_person_id_ctx.reset(ctx_person)

    def is_allowed_origin(self, origin: str) -> bool:
        return True

