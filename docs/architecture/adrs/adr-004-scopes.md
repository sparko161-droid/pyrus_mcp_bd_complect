# ADR-004: Scopes and Authorization Matrix
**Status:** Approved

## Context
Limiting AI agent capabilities.

## Decision
We will define strict scopes (e.g., \	asks:read\, \	asks:write\, \contacts:read\). The 61 legacy tools from Phase 0 are mapped to these scopes. An MCP session must be granted specific scopes at initialization. If an agent tries to call \create_task\ but only has \	asks:read\, the MCP server will reject it locally, saving a Pyrus API call.
