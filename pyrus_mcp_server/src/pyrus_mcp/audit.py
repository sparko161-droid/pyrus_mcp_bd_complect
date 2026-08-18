import structlog
from typing import Optional
from .context import correlation_id, tenant_id

logger = structlog.get_logger("audit")

class AuditLogger:
    @staticmethod
    def log_security_event(event: str, success: bool, client_id: Optional[str] = None, reason: Optional[str] = None):
        """
        Structured audit logging for security-sensitive events.
        """
        logger.info(
            "security_audit_event",
            event_type=event,
            success=success,
            reason=reason,
            client_id=client_id,
            tenant_id=tenant_id.get(),
            correlation_id=correlation_id.get()
        )
