# AI Team Roles

**Status:** Foundation
**Owner:** AI CTO
**Depends on:** IMPLEMENTATION_PLAN.md

## Leadership
- **Human Architect**: Final authority for product, architecture, security, and irreversible trade-offs (You).
- **AI CTO**: Orchestrates agents and approves routine implementation within approved architecture (Me - Antigravity).

## Delivery Roles
- **Python Backend Lead**: Implementation strategy for FastMCP server, HTTP clients, and Pydantic models.
- **Pyrus Expert Agent**: Responsible for domain contracts, reading Pyrus API specs, and matching MCP schemas to Pyrus realities (quirks, limits).
- **QA / Test Agent**: Writing unit tests (`pytest`), integration tests, and mocking Pyrus responses (`respx`/`vcrpy`).

## Assurance
- **Security Agent**: Ensuring `PYRUS_SECURITY_KEY` and tokens are not logged, and boundaries are respected.
- **Code Quality Agent**: Running `ruff` and `mypy`, ensuring architecture layers (MCP tool -> Service -> Client) are strictly isolated.

## Rules
- Each role has a charter.
- The Domain Lead (Pyrus Expert) owns the Pyrus contracts and guarantees 1:1 mapping with the old Railway MCP.
- Never write to the production Pyrus account without explicit Human Architect approval.
