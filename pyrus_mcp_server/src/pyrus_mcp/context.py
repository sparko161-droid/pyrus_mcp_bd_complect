import contextvars
from typing import Optional

# Request Correlation ID
correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="unknown")

# Tenant / Identity Context
tenant_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("tenant_id", default=None)

# Dynamic Credentials for Multi-Tenancy
pyrus_login_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("pyrus_login_ctx", default=None)
pyrus_security_key_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("pyrus_security_key_ctx", default=None)
pyrus_person_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("pyrus_person_id_ctx", default=None)
