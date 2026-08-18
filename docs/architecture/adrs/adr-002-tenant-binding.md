# ADR-002: Tenant and Account Binding
**Status:** Approved

## Context
To prevent cross-tenant data leakage, we need strict binding between an MCP session and a Pyrus tenant space.

## Decision
We will enforce an in-memory/redis mapping: mcp_session_id -> { tenant_id, default_route_id }. Every tool execution will implicitly read this context. No tool will accept 	enant_id as a raw argument from the AI model.
