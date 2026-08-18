import contextvars
from typing import Optional

# Request Correlation ID
correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="unknown")

# Tenant / Identity Context (Phase 1 Proxy mapping)
tenant_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("tenant_id", default=None)
