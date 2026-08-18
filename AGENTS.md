# AGENTS.md — Pyrus MCP Server Constitution

## Mission
Build the `pyrus_mcp` Python server as a robust, production-grade integration for the multi-agent system, replacing the closed-source Railway server.

## Authority
**Human Architect** is the final authority for product, architecture, and security.
**AI CTO** orchestrates agents (Pyrus Expert, Python Backend Lead) to implement the architecture outlined in `IMPLEMENTATION_PLAN.md`.

## Before coding
1. Read `IMPLEMENTATION_PLAN.md` and the toolkit specs (`pyrus_mcp_tools_spec.json`, `inventory.json`).
2. Search for existing solutions in `life_platform` or previous implementations before re-inventing structures (e.g. Rate Limiters).
3. Raise unresolved product/architecture questions to the Human Architect, with options.

## Phase discipline
Follow the phases in `IMPLEMENTATION_PLAN.md`.
Do not skip to tools implementation before the core layers (`client.py`, `auth.py`, `rate_limit.py`) are fully built and tested.

## Quality rule
A feature cannot be completed without corresponding Pydantic schema validation and unit tests (`pytest`).
Never put raw HTTP logic directly inside the MCP tool definition — always route through the Service Layer.

## Never
- Expose the `PYRUS_SECURITY_KEY` or `access_token` in logs or tracebacks.
- Mutate the production Pyrus environment. Always use sandbox or mock responses.
- Skip handling Pyrus quirks (e.g., pagination bounds, hidden tasks in registry) defined in the toolkit.
