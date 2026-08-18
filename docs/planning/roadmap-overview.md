# Roadmap Overview v2

The previous overview was an epic-level summary. The authoritative roadmap is now `docs/planning/production-roadmap-v2.md`, while `tasks/registry.yaml` is the executable dependency graph.

## Current sequence

1. **Contract recovery** — recover the exact legacy MCP surface before claiming 1:1 parity.
2. **Product/security model** — identity, OAuth/MCP authorization, scopes, tenants, threat model and SLOs.
3. **Engineering foundation** — Python/uv/CI/security/container.
4. **MCP protocol shell** — Streamable HTTP, lifecycle, protocol versioning, Origin validation, health.
5. **Identity/tenant enforcement** — multi-user authentication, authorization, revocation and audit.
6. **Pyrus client core** — `/auth`, token refresh, tenant-specific `api_url`/`files_url`, HTTP, rate limiting, retries, errors.
7. **Domain models** — typed Pyrus models and fixtures.
8. **Read-only parity** — one independently testable implementation/review cycle per tool group, then per-tool compatibility expansion.
9. **Write parity** — each write operation separately reviewed for security/idempotency/partial failure.
10. **Parity freeze** — compatibility report and ADRs for deviations.
11. **New capabilities** — cache, comments pagination, registry improvements, batch writes, webhooks.
12. **Production hardening** — PostgreSQL, observability, security, staging, deployment and rollback.
13. **Knowledge MCP** — canonical versioned knowledge + embeddings + hybrid retrieval + evidence + controlled Pyrus KB publication.
14. **PyrusBot integration** — orchestration over the two infrastructure services.
15. **Future UI migration** — expose the PyrusBot orchestration core through chat/CLI/web/IDE adapters.

## Why the order changed

The old plan allowed implementation to move toward the 61-tool surface before the legacy contract was actually versioned in this repository. That creates a hidden compatibility risk. The new plan makes contract recovery a blocking Phase 0.

The old single `SERVER_AUTH_TOKEN` approach is also insufficient for a public multi-user service. The new roadmap therefore establishes identity, scopes and tenant isolation before tools become production-callable.

The old SQLite-first persistence approach remains valid for local development but is not the production system of record.

## Parallel work

After the MCP protocol shell is stable, teams may work in parallel on:

- contract recovery;
- individual domain models;
- security tests;
- compatibility fixtures;
- read-only tool groups;
- observability groundwork;
- documentation/ADRs.

Write tools, publication and production deployment remain gated by their upstream contracts.

## Discovery workflow

If an agent finds a gap:

1. stop the affected implementation task;
2. create a linked work item in `tasks/registry.yaml`;
3. mark the current task blocked where necessary;
4. record evidence and the decision needed;
5. resume only after the dependency becomes `DONE`/accepted.
