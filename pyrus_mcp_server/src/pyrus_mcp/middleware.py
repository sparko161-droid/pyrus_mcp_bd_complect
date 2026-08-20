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

WEBHOOK_BYPASS_PATHS = {"/webhook", "/metrics"}

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        token_ctx = correlation_id.set(req_id)
        
        login_val = request.headers.get("x-pyrus-login")
        sec_key_val = request.headers.get("x-pyrus-security-key")
        person_id_val = request.headers.get("x-pyrus-person-id")
        
        ctx_login = pyrus_login_ctx.set(login_val) if login_val else None
        ctx_sec = pyrus_security_key_ctx.set(sec_key_val) if sec_key_val else None
        ctx_person = pyrus_person_id_ctx.set(person_id_val) if person_id_val else None

        try:
            if request.method == "OPTIONS":
                return await call_next(request)

            origin = request.headers.get("origin")
            if origin and not self.is_allowed_origin(origin):
                AuditLogger.log_security_event("origin_rejected", success=False, reason="Forbidden Origin")
                return JSONResponse({"error": "Forbidden Origin"}, status_code=403)

            if request.url.path in WEBHOOK_BYPASS_PATHS:
                response = await call_next(request)
                response.headers["x-request-id"] = req_id
                return response

            auth_header = request.headers.get("authorization")
            has_valid_auth = False

            if auth_header and auth_header.startswith("Bearer "):
                token_str = auth_header.split(" ")[1]
                token = token_service.validate_token(token_str)
                
                # Check for static server token or direct Pyrus credentials bypass
                static_token = getattr(settings, "server_auth_token", None)
                if token:
                    tenant_id.set(token.tenant_id)
                    request.state.scopes = token.scopes
                    has_valid_auth = True
                    AuditLogger.log_security_event("auth_success", success=True, client_id=token.client_id)
                elif static_token and token_str == static_token:
                    tenant_id.set("default")
                    has_valid_auth = True
                    AuditLogger.log_security_event("auth_success", success=True, client_id="static_env")
                elif login_val and sec_key_val:
                    tenant_id.set(login_val)
                    has_valid_auth = True
                    AuditLogger.log_security_event("auth_success", success=True, client_id="direct_pyrus")
                
                if not has_valid_auth and settings.enable_tenant_isolation:
                    AuditLogger.log_security_event("auth_failed", success=False, reason="Invalid or expired token")
                    return JSONResponse({"error": "Unauthorized: Invalid or expired token"}, status_code=401)
            else:
                if request.url.path.startswith("/mcp") and settings.enable_tenant_isolation:
                    if login_val and sec_key_val:
                        tenant_id.set(login_val)
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
