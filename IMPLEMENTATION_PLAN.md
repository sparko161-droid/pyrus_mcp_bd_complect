# Pyrus MCP — Implementation Plan v2

This file is the normative entry point for implementation. The previous plan mixed architecture, large epics and assumptions. The executable task graph is now `tasks/registry.yaml`; the architecture is `docs/architecture/system-architecture-v2.md`; contracts are `docs/architecture/contracts-v2.md`; the phase roadmap is `docs/planning/production-roadmap-v2.md`.

## Current product scope

This repository is responsible first for the **production Pyrus MCP infrastructure service**:

```text
AI host / employee
    -> external Pyrus MCP
    -> authenticated tenant context
    -> Pyrus API / Pyrus Datacenter
```

A future **Knowledge MCP** is also specified here because it grows from the same ecosystem, but it remains a separate service with its own datastore and lifecycle. PyrusBot is an eventual consumer/orchestrator, not a runtime dependency of Pyrus MCP.

## Normative stack

### Pyrus MCP

- Python 3.11+ runtime policy, version pinned by repository policy;
- `uv` for environment/dependencies;
- FastMCP for MCP protocol layer;
- Streamable HTTP for production;
- stdio for local development only;
- Pydantic for typed input/domain models;
- httpx for outbound Pyrus API calls;
- pytest for testing;
- Ruff for lint/format;
- MyPy or the repository-approved type checker;
- PostgreSQL for production durable state;
- SQLite only for local development;
- Redis optional for shared cache/rate-limit/queue state when required;
- Docker for packaging;
- GitHub Actions for CI/CD;
- external secret manager in production.

### Knowledge MCP

- Python + FastMCP;
- PostgreSQL + pgvector as canonical structured/vector storage;
- object storage for large/raw artifacts where required;
- background worker for embedding/indexing;
- embedding provider behind a versioned adapter;
- Redis optional for asynchronous jobs/cache;
- same deployment/security engineering discipline as Pyrus MCP.

## Critical corrections from v1

1. **The legacy contract is not currently fully versioned.** `IMPLEMENTATION_PLAN.md` previously referenced `pyrus_mcp_tools_spec.json` and `inventory.json`, but those artefacts are absent from the current repository. Phase 0 therefore explicitly recovers them before parity work.
2. **The visible plan's stated "61 tools" is not independently reproducible from the grouped tool list in the document.** The recovery task must establish the exact number and names from authoritative legacy evidence.
3. **`SERVER_AUTH_TOKEN` is not the production multi-user security model.** The production design requires authenticated users/clients, audience-bound bearer tokens, scopes, tenant binding, rotation/revocation and audit.
4. **SQLite is not a production durable store for a horizontally replaceable public service.** PostgreSQL is the production system of record.
5. **Webhooks are an HTTP integration boundary, not ordinary MCP tools.** Signature validation, idempotency, fast acknowledgement and asynchronous processing are required. Pyrus currently documents bot configuration by assigning a handler URL, so programmatic webhook registration is a research item rather than an assumed API method.
6. **Every tool has four contracts:** MCP, service, Pyrus API, and security/authorization.
7. **Production is a separate gate.** Local success, mock tests and tool parity do not equal production readiness.
8. **Knowledge MCP is not allowed to use Pyrus Knowledge Base as its canonical store.** Pyrus KB is a downstream publication projection of an approved immutable knowledge version.

## Phase sequence

### Phase 0 — Contract recovery

Recover the legacy tool catalogue, schemas, outputs, errors, quirks, endpoint mappings and fixtures. Freeze a reproducible compatibility baseline.

### Phase 1 — Product and threat model

Approve identity, multi-tenancy, authorization, threat model, SLOs and retention.

### Phase 2 — Delivery foundation

Make build/test/container/CI/security scanning reproducible.

### Phase 3 — MCP protocol shell

Implement Streamable HTTP, lifecycle, protocol versioning, Origin validation, context, cancellation and health endpoints.

### Phase 4 — Identity and tenancy

Implement user/client identity, token issuance/validation, scopes, tenancy, revocation, audit and isolation tests.

### Phase 5 — Pyrus client core

Implement per-tenant credentials, Pyrus `/auth`, person_id support, access-token refresh, tenant-specific `api_url`/`files_url`, shared HTTP client, retries, limits, errors and circuit breaker.

### Phase 6 — Domain models

Typed Pyrus models and recorded API fixtures.

### Phase 7 — Read-only compatibility tools

Implement each recovered read-only tool group as independently testable work.

### Phase 8 — Write compatibility tools

Implement writes with explicit idempotency/partial-failure analysis and sandbox tests.

### Phase 9 — Compatibility freeze

Automated old-vs-new comparison and explicit ADRs for every accepted deviation.

### Phase 10 — New features

Form cache, comment pagination, registry status/pagination, batch writes, webhook ingestion/queue/retrieval.

### Phase 11 — Production persistence

PostgreSQL, migrations, durable audit/idempotency/webhook state, recovery and optional Redis adapters.

### Phase 12 — Observability/SRE

Structured logs, metrics, tracing, alerts, SLOs, dashboards and runbooks.

### Phase 13 — Security hardening

SAST/dependencies/image scans, auth fuzzing, tenant-isolation tests, SSRF/origin/payload tests, secret-leak regression.

### Phase 14 — Staging acceptance

Run the exact release candidate through protocol, compatibility, sandbox, load, failure-injection and rollback tests.

### Phase 15 — Production

Immutable artifact, controlled deployment, smoke/health gate, monitoring and rollback.

### Phase 16 — Knowledge MCP contracts

Freeze document/version/evidence/chunk/embedding/retrieval/approval/publication contracts.

### Phase 17 — Knowledge MCP implementation

Implement canonical versioned knowledge storage, embeddings and hybrid retrieval, provenance and Pyrus KB publication projection.

### Phase 18 — PyrusBot integration

PyrusBot uses Pyrus MCP for Pyrus actions/facts and Knowledge MCP for canonical context; approved documentation is published through Pyrus MCP.

### Phase 19 — Future interface migration

Move PyrusBot orchestration behind stable interfaces so it can later be exposed via chat, CLI, web or IDE adapters.

## Task execution model

All implementation work is governed by `tasks/registry.yaml`.

Each task has:

- one primary executor;
- independent reviewer;
- gate owner(s);
- explicit dependencies;
- status;
- phase;
- test/evidence expectation.

A task is split whenever more than one independent implementation or acceptance outcome is hidden inside it.

## Required gates

- Architecture Gate — Chief Architect
- Pyrus API Contract Gate — Pyrus Integrations Lead
- Identity/Security Gate — Identity Security Lead + Security Agent
- Quality Gate — QA Lead
- Code Quality Gate — Code Quality Agent
- Data/Migration Gate — Data Engineer
- Delivery/SRE Gate — DevOps Lead
- Documentation Gate — Documentation Agent
- Release Gate — Release Manager
- Product/Security/Production Final Approval — Human Architect

The executor cannot be the sole reviewer or final gate owner.

## External sources used for normative constraints

Pyrus `/auth` returns an access token plus `api_url`/`files_url` and requires re-authorization when tokens expire or are revoked. citeturn142115search0turn142115search4

Pyrus webhooks use HTTPS POST, `X-Pyrus-Sig`, and retry behavior; handlers must acknowledge within 60 seconds. citeturn142115search1turn142115search2

MCP Streamable HTTP requires the standardized HTTP transport/lifecycle, Origin validation and proper authorization; bearer tokens are validated as OAuth resource-server credentials with audience and scope enforcement. citeturn755532search1turn755532search0turn755532search7

FastMCP provides request context/dependency injection and server lifespans that fit the required separation of transport, authorization and application services. citeturn504311search1turn504311search0
