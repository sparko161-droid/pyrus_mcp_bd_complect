# AI Team Roles v3

**Status:** Normative
**Owner:** AI CTO
**Depends on:** `IMPLEMENTATION_PLAN.md`, `tasks/registry.yaml`, `tasks/2026-08-audit-overlay.yaml`, architecture and contract documents.

## Leadership

- **Human Architect** — final authority for product scope, architecture, security, irreversible trade-offs and production release.
- **AI CTO** — orchestration, dependency management, synthesis, escalation and release recommendation.
- **Chief Architect** — system boundaries, ADRs, layer integrity and architecture gate.
- **Architecture Red-Team Agent** — adversarial review of phase coherence, documentation/code divergence, hidden coupling, scalability, failure modes and future-version risk. May block a phase on P0/P1 findings.

## Pyrus integration

- **Pyrus Integrations Lead** — Pyrus API research, endpoint contracts, quirks, legacy compatibility and Pyrus domain/tool implementations.
- **API Contract Auditor** — independent method-by-method reconciliation against official API documentation, legacy/source provenance, schema hashes, fixture completeness and API drift. This role is the owner of the compliance matrix, not of implementation.

## iiko integration

- **iiko Integration Lead** — iiko Cloud and iikoServer domain expertise, official API snapshot, endpoint matrix, normalization models and iiko MCP implementation.
- **iiko Operations/Safety Reviewer** — independent review of order/delivery/payment/reservation mutations, idempotency, confirmation and rollback semantics. For now this role may be fulfilled by Security Agent + Human Architect until dedicated capacity exists.

## Identity/security

- **Identity Security Lead** — MCP/OAuth-compatible auth, identity, token lifecycle, scopes, tenancy and authorization middleware.
- **Security Agent** — threat model, abuse cases, secret handling, security testing and security gate.

## Implementation/data

- **Python Backend Lead** — FastMCP application, services, HTTP client integration, typed Python implementation and shared runtime patterns.
- **Data Engineer** — production schema, migrations, repositories, durable audit/idempotency/webhook state, backup/recovery and data lifecycle.

## Knowledge MCP

- **Knowledge Architecture Lead** — document/version/change-set/evidence/access/publication contracts and Knowledge MCP service architecture.
- **Retrieval Engineer** — deterministic chunking, embeddings, vector/full-text/hybrid search, ranking and retrieval evaluation.
- **Knowledge Reliability Engineer** — operational correctness of the Solution Bank: stale-version prevention, tenant isolation, index freshness, retrieval quality, publication integrity, knowledge lifecycle and usefulness metrics.
- **Evidence & Case Curator** — turns resolved tasks/events/user corrections into normalized evidence, detects duplicates/novelty, prepares solution candidates and maintains provenance quality.

## AI quality

- **AI Evaluation Lead** — benchmark design for tool selection, context usefulness, citation correctness, stale-data suppression, hallucination resistance, agent feedback loops and regression evaluation.

## Quality/delivery

- **QA Lead** — unit, fixture, integration, compatibility, load, failure and acceptance testing.
- **Code Quality Agent** — lint/type/static policy and code-level architecture enforcement.
- **Documentation Agent** — ADRs, contracts, runbooks and implementation evidence.
- **DevOps Lead** — CI/CD, containers, staging, observability, infrastructure and deployment tooling.
- **Release Manager** — release candidate integrity, staging acceptance, production rollout and rollback coordination.

## Assignment rules

Every task has one primary executor and one independent reviewer. Security-sensitive and production tasks may have multiple gate owners.

The executor never becomes the sole acceptance authority.

The API Contract Auditor owns the official-method compliance matrix and drift evidence; the Pyrus Integrations Lead owns implementation compatibility; the iiko Integration Lead owns iiko domain implementation; the Knowledge Architecture Lead owns semantic contracts; the Knowledge Reliability Engineer owns operational knowledge quality; the Architecture Red-Team Agent owns adversarial coherence review; the AI Evaluation Lead owns agent-level acceptance metrics.

Any task that discovers a missing method, undocumented behavior, broken lifecycle transition, stale index or architecture contradiction must create a linked discovery task rather than silently expanding scope.
