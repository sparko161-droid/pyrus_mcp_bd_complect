# ADR-006: SLO, SLA, and Quotas
**Status:** Approved

## Context
Reliability and limits.

## Decision
- **Availability Target:** 99.9% uptime for the MCP server layer.
- **Latency Target:** <200ms overhead on top of Pyrus API response times.
- **Quotas:** Adhere to Pyrus 5,000 req/10m. The MCP server will expose a \get_rate_limit_status\ tool for the agent to self-monitor.
