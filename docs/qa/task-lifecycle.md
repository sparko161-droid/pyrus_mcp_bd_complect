# Task Lifecycle

**Status:** Foundation

## State Machine
The workflow for `pyrus_mcp` follows this strict state machine:
`BACKLOG` → `IN_PROGRESS` (Dev) → `REVIEW` (Cross-check) → `QA` (Tests) → `DONE`

## Rework
`REVIEW` → `REWORK` → `IN_PROGRESS`
If the API Contract Gate or Quality Gate fails, the reviewing agent must provide evidence (e.g. failing test logs, or a mismatch in `inventory.json`) rather than vague complaints.

## Scope Creep & Discoveries
`REVIEW` → `PASS_WITH_DISCOVERIES` → `NEW_TASK`
If during development, an agent discovers that the Pyrus API behaves differently than documented, or a new tool is needed (e.g. a webhook handler), they **must not** silently expand the scope of the current task. 
Instead, they log a Discovery in `tasks/discoveries/` and create a `NEW_TASK` in `registry.yaml`.

## Parallelism
Independent tools (e.g. `catalogs` vs `announcements`) can be developed in parallel once the Core Client (Phase 3) is frozen.

## Merge Rule
Only tasks with ALL mandatory gates passed (Architecture, API Contract, QA, Security) may be marked as `DONE` and integrated.
