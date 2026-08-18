# AI Team Roles v2

**Status:** Normative
**Owner:** AI CTO
**Depends on:** `IMPLEMENTATION_PLAN.md`, `tasks/registry.yaml`, architecture and contract documents.

## Leadership

- **Human Architect** — final authority for product scope, architecture, security, irreversible trade-offs and production release.
- **AI CTO** — orchestration, dependency management, synthesis, escalation and release recommendation.
- **Chief Architect** — system boundaries, ADRs, layer integrity and architecture gate.

## Pyrus integration

- **Pyrus Integrations Lead** — Pyrus API research, endpoint contracts, quirks, legacy compatibility and all Pyrus domain/tool implementations.

## Identity/security

- **Identity Security Lead** — MCP/OAuth-compatible auth, identity, token lifecycle, scopes, tenancy and authorization middleware.
- **Security Agent** — threat model, abuse cases, secret handling, security testing and security gate.

## Implementation/data

- **Python Backend Lead** — FastMCP application, services, HTTP client integration, typed Python implementation and shared runtime patterns.
- **Data Engineer** — PostgreSQL schema, migrations, repositories, durable audit/idempotency/webhook state, backup/recovery.

## Knowledge MCP

- **Knowledge Architecture Lead** — document/version/change-set/evidence/access/publication contracts and Knowledge MCP service architecture.
- **Retrieval Engineer** — deterministic chunking, embeddings, vector/full-text/hybrid search, ranking and retrieval evaluation.

## Quality/delivery

- **QA Lead** — unit, fixture, integration, compatibility, load, failure and acceptance testing.
- **Code Quality Agent** — lint/type/static policy and code-level architecture enforcement.
- **Documentation Agent** — ADRs, contracts, runbooks and implementation evidence.
- **DevOps Lead** — CI/CD, containers, staging, observability, infrastructure and deployment tooling.
- **Release Manager** — release candidate integrity, staging acceptance, production rollout and rollback coordination.

## Assignment rules

Every task has one primary executor and one independent reviewer. Security-sensitive and production tasks may have multiple gate owners.

The executor never becomes the sole acceptance authority.

The Pyrus Integrations Lead owns Pyrus API compatibility; the Knowledge Architecture Lead owns Knowledge MCP semantics; the Human Architect remains the final authority over cross-product decisions.
