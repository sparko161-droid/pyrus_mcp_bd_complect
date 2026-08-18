# Task Registry (pyrus_mcp)

This directory is the source-controlled planning layer for the AI development team, inspired by the `life_platform` methodology.

## Files
- `registry.yaml` — Canonical machine-readable task list mapping to `IMPLEMENTATION_PLAN.md` phases.
- `packets/` — Detailed implementation briefs for each task.
- `discoveries/` — Findings from the Pyrus API lab that require workstream changes.
- `handoffs/` — Agent shift handoff states.

## Workflow
Agents must update `registry.yaml` status (`todo` -> `in-progress` -> `done`) before picking up new work and summarize changes in `handoffs/`.
