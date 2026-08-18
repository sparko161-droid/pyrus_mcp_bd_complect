"""
Prometheus metrics definitions for Pyrus MCP Server.
All metrics are registered at module import time.
"""
from prometheus_client import Counter, Histogram, Gauge, REGISTRY, generate_latest
from starlette.requests import Request
from starlette.responses import Response

# ── Request metrics ────────────────────────────────────────────────────────────
REQUEST_COUNT = Counter(
    "pyrus_mcp_requests_total",
    "Total HTTP requests received",
    ["method", "path", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "pyrus_mcp_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

# ── Pyrus API client metrics ───────────────────────────────────────────────────
PYRUS_API_CALLS = Counter(
    "pyrus_mcp_pyrus_api_calls_total",
    "Total calls made to the Pyrus API",
    ["method", "endpoint", "status_code"],
)

PYRUS_API_LATENCY = Histogram(
    "pyrus_mcp_pyrus_api_duration_seconds",
    "Pyrus API call duration in seconds",
    ["endpoint"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# ── Auth & security metrics ────────────────────────────────────────────────────
AUTH_FAILURES = Counter(
    "pyrus_mcp_auth_failures_total",
    "Total authentication failures",
    ["reason"],
)

WEBHOOK_EVENTS = Counter(
    "pyrus_mcp_webhook_events_total",
    "Total webhook events received",
    ["event_type", "status"],  # status: accepted | duplicate | rejected
)

# ── /metrics scrape endpoint ───────────────────────────────────────────────────
async def metrics_endpoint(request: Request) -> Response:
    """Prometheus scrape endpoint — not protected by Bearer auth."""
    data = generate_latest(REGISTRY)
    return Response(
        content=data,
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
