# Review Outcomes

**Status:** Foundation

## Independent Review
A feature author (e.g. Python Backend Lead) cannot be the sole approver of their own code. At least one independent reviewer (e.g. QA Agent or Pyrus Expert Agent) must pass the gates.

## Required Review Output
When an agent reviews code, they must generate a handoff packet in `tasks/handoffs/` containing:
1. **Result**: PASS | REWORK | BLOCKED
2. **Evidence**: Output of `pytest`, `ruff`, `mypy`.
3. **API Contract Verification**: Diff or confirmation that the new tool matches the `pyrus_mcp_tools_spec.json`.
4. **Security Evidence**: Confirmation that logs were audited for leaked secrets.
5. **Discoveries**: Any new findings added to `tasks/discoveries/`.

## Decision Rules
- **Wrong implementation**: REWORK (e.g., rate limiter allows too many requests).
- **Missing undocumented feature**: DISCOVERY -> NEW_TASK (e.g., Pyrus pagination limit is smaller than expected).
- **Architecture blocked**: BLOCKED (escalate to Human Architect).
