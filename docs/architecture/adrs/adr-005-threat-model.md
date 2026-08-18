# ADR-005: Threat Model & Abuse Cases
**Status:** Approved

## Context
Preventing rogue AI loops and data exfiltration.

## Decision
- **Threat:** Infinite AI loop calling API. **Mitigation:** Strict rate limiter (bucket token algorithm) inside the MCP server (max 100 req/minute per session).
- **Threat:** AI guessing task IDs from other tenants. **Mitigation:** MCP server enforces 	enant_id context implicitly; Pyrus API rejects unauthorized task access naturally.
- **Threat:** Prompt injection payload in task comments. **Mitigation:** All data read from Pyrus is treated as untrusted and passed cleanly to the LLM context, but the LLM system prompt must instruct the agent to sanitize it.
