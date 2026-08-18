# ADR-003: Token Strategy
**Status:** Approved

## Context
Secure token storage.

## Decision
Master Integration tokens will be stored in environment variables (\PYRUS_API_TOKEN\). In multi-tenant SaaS deployments, they will be fetched dynamically from a secure Vault backend based on the \mcp_client_id\.
