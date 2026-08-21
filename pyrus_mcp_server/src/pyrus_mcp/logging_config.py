"""
Centralized structlog configuration for the Pyrus MCP Server.
Outputs JSON logs with automatic secret redaction and context injection.
"""
import logging
import structlog
from .context import correlation_id, tenant_id

# Fields that should never appear in plain text in logs
_SENSITIVE_KEYS = frozenset({
    "token", "access_token", "security_key", "password",
    "authorization", "pyrus_security_key", "webhook_secret",
    "secret", "api_key", "bearer",
})


def _redact_sensitive(logger, method, event_dict: dict) -> dict:
    """Processor: replaces sensitive values with [REDACTED]."""
    for key in list(event_dict.keys()):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict


def _inject_context(logger, method, event_dict: dict) -> dict:
    """Processor: auto-injects correlation_id and tenant_id from contextvars."""
    try:
        cid = correlation_id.get()
        if cid:
            event_dict["correlation_id"] = cid
    except LookupError:
        cid = None

    try:
        tid = tenant_id.get()
        if tid:
            event_dict["tenant_id"] = tid
    except LookupError:
        tid = None

    return event_dict


def configure_logging(json_logs: bool = True) -> None:
    """
    Configure structlog globally. Call once at server startup.
    Set json_logs=False for development-friendly colored output.
    """
    shared_processors = [
        structlog.stdlib.add_log_level,
        
        structlog.processors.TimeStamper(fmt="iso"),
        _inject_context,
        _redact_sensitive,
    ]

    if json_logs:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

