# Roadmap Overview

**Project:** Pyrus FastMCP Server
**Status:** Inception

This roadmap translates the `IMPLEMENTATION_PLAN.md` into our strictly gated Task Registry phases. 

## Milestone 1: The Core (Tasks P0-000 to P0-003)
- **Goal**: Establish the Python project, linting rules, and the base Pyrus HTTP client with correct `auth.py` and `rate_limit.py`.
- **Primary Roles**: `python-backend-lead`, `chief-architect`
- **Quality Gates**: Architecture Review, Security (no leaked keys).

## Milestone 2: 1:1 API Parity (Tasks P0-004 to P0-006)
- **Goal**: Reproduce all 61 tools exactly as they functioned in the Railway server.
- **Primary Roles**: `pyrus-integrations-lead`
- **Quality Gates**: API Contract Gate (Must strictly match `pyrus_mcp_tools_spec.json`).

## Milestone 3: New Capabilities (Task P0-007)
- **Goal**: Implement the 6 requested augmentations: auto-pagination, batch updates, explicit `is_closed`, webhook queueing, comments pagination, and SQLite form metadata caching.
- **Primary Roles**: `python-backend-lead`
- **Quality Gates**: QA Gate (Test coverage for edge cases like SQLite concurrency).

## Milestone 4: Production Readiness (Tasks P0-008 to P0-009)
- **Goal**: Full automated testing against the Pyrus Sandbox, security sweep, and Docker deployment.
- **Primary Roles**: `qa-lead`, `security-agent`, `devops-lead`
- **Quality Gates**: CTO Synthesis, Human Architect Final Approval.

## Discovery Workflow
If during Milestone 2 or 3 an agent discovers a blocker (e.g., Pyrus API limits are different than expected, or Webhook subscription via API is impossible):
1. **STOP** current implementation.
2. Log the issue in `tasks/discoveries/<issue-name>.md`.
3. Create a new blocking task in `registry.yaml`.
4. Escalate to the AI CTO / Human Architect for a decision.
