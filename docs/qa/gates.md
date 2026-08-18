# AI Gates

**Status:** Foundation
**Owner:** AI CTO

In the `pyrus_mcp` project, no code is merged into the main branch without passing the required gates. The executor (e.g. Python Backend Lead) cannot pass their own gates.

## Architecture Gate
- **Owner**: Chief Architect
- **Checks**: Does the implementation follow the 3-layer architecture (`tools` -> `services` -> `client`) defined in `IMPLEMENTATION_PLAN.md`? Are SQLite caching and rate-limits used correctly instead of reinventing them?

## API Contract Gate
- **Owner**: Pyrus Expert Agent
- **Checks**: Does the `fastmcp` tool parameter schema exactly match the schemas defined in `pyrus_mcp_tools_spec.json`? Are Pyrus quirks (like `is_closed` logic or pagination limits) handled correctly?

## Quality & QA Gate
- **Owner**: QA Agent
- **Checks**: Are there `pytest` unit tests using mocked `httpx` responses? Does `ruff` and `mypy` pass with no errors? Is there a test for the rate-limiting behavior?

## Security Gate
- **Owner**: Security Agent
- **Checks**: Are `PYRUS_SECURITY_KEY` and `access_token` strictly omitted from logging, tracebacks, and error messages?

## Synthesis (AI CTO)
- **Owner**: AI CTO (Antigravity)
- **Checks**: Orchestrates the agents, collects gate outcomes, and escalates irreversible decisions (e.g. changing the DB from SQLite to Postgres) to the Human Architect.
