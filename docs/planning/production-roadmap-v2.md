# Pyrus MCP Production Roadmap v2

**Repository:** `pyrus_mcp_bd_complect`
**Primary branch:** `main`
**Goal:** replace the closed external Pyrus MCP with a production-grade multi-user service and establish the contracts required for the future Knowledge MCP.

## Phase 0 — Baseline and contract recovery

**Gate:** no implementation expansion until the current legacy MCP contract is recoverable from versioned repository evidence.

Tasks:

- recover the missing 61-tool catalogue from the legacy server/fixtures/export;
- recover input/output schemas and behavior examples;
- recover Pyrus endpoint mappings;
- record Pyrus quirks and known edge cases;
- record which legacy behaviors are intentionally compatibility requirements;
- create the official API inventory;
- create the compatibility matrix;
- verify current repository references are valid;
- write ADR-012 compatibility/versioning policy.

Exit evidence: complete versioned contract catalogue and inventory exist in `contracts/`.

## Phase 1 — Product and threat model

**Gate:** architecture approved by Human Architect and Security Agent.

Define:

- target users and use cases;
- multi-user model;
- tenant model;
- personal/service credential model;
- OAuth/MCP auth boundary;
- scopes;
- threat model;
- data classification;
- abuse cases;
- rate/quotas;
- availability target;
- backup/recovery target;
- privacy/security requirements;
- production support model.

## Phase 2 — Repository and delivery foundation

Build the executable foundation:

- Python project with pinned runtime policy;
- `uv` dependency management;
- `pyproject.toml`;
- Ruff;
- MyPy/pyright policy;
- Pytest;
- pre-commit;
- GitHub Actions;
- dependency/security scanning;
- container build;
- SBOM/image scanning;
- local compose environment;
- staging configuration model;
- secret-management interface.

Exit: clean build + tests + container + static checks.

## Phase 3 — MCP protocol shell

Implement and test:

- FastMCP application;
- `/mcp` Streamable HTTP endpoint;
- stdio development transport;
- initialize/version negotiation;
- capabilities;
- protocol-version header validation;
- Origin validation;
- request limits;
- cancellation/timeouts;
- health endpoints;
- graceful lifecycle/shutdown;
- request context and correlation ids.

MCP transport and lifecycle behavior must follow the MCP specification. citeturn755532search1turn755532search7

## Phase 4 — Identity, authorization and tenancy

Implement in this order:

1. token/identity domain model;
2. client registration;
3. token issuance/validation;
4. expiry/revocation;
5. audience validation;
6. scopes;
7. tenant binding;
8. authorization middleware;
9. audit events;
10. operator administration;
11. security tests;
12. token rotation/recovery runbook.

The HTTP MCP authorization model is OAuth-oriented; the server must behave as a protected resource and validate audience/scopes. citeturn755532search0

## Phase 5 — Pyrus credentials and API client core

Build:

- tenant credential repository;
- secret-manager adapter;
- Pyrus auth client;
- `person_id` support;
- token cache/refresh;
- `api_url`/`files_url` resolution;
- HTTP client;
- timeout policies;
- retry classifier;
- exponential backoff + jitter;
- rate limiter;
- error mapping;
- response decoding/validation;
- safe logging;
- circuit breaker.

Pyrus `/auth` returns the access token and tenant-specific API/file URLs, and tokens can be revoked/expire; the implementation must therefore re-authorize rather than treating the token as permanent. citeturn142115search0turn142115search4

## Phase 6 — Domain model layer

Create typed domain models and tests for:

- task;
- form;
- field;
- form register;
- catalog;
- catalog item;
- member;
- role;
- list;
- announcement;
- knowledge-base object;
- file metadata;
- profile/contact/calendar objects;
- common paging/error envelopes.

The model layer is not allowed to invent undocumented behavior: unknown upstream properties are handled deliberately and tested.

## Phase 7 — Compatibility tools: read-only

Implement each tool as a separate task with four contracts: MCP, service, Pyrus API and security.

Groups:

- profile/bots/contacts/meetings/inbox/calendar/files metadata;
- forms;
- form permissions;
- members;
- roles;
- lists;
- catalogs;
- announcements;
- knowledge-base read operations;
- task reads/searches/register.

Each tool requires a parity fixture and automated compatibility test.

## Phase 8 — Compatibility tools: write operations

Implement independently:

- member writes;
- role writes;
- list writes;
- catalog writes;
- announcement writes/comments;
- knowledge-base writes;
- task creation/update/assignment;
- approvals/subscribers/comments;
- task closing/reopening/deletion;
- attachment operations.

Every write operation requires explicit idempotency analysis and security review.

## Phase 9 — 61-tool parity gate

Run the entire compatibility matrix.

Acceptance dimensions:

- tool name;
- tool description where client-visible compatibility matters;
- JSON schema;
- defaults;
- enum behavior;
- null/empty semantics;
- result shape;
- error category;
- edge cases;
- side effects;
- permissions/scopes;
- observed upstream behavior.

Any deviation becomes `COMPATIBILITY_BREAK` and requires an ADR or explicit acceptance.

## Phase 10 — New capabilities

Implement one capability per vertical slice:

1. form metadata cache;
2. comments pagination service;
3. explicit `is_closed` semantics;
4. registry auto-pagination;
5. batch write operations;
6. webhook ingestion;
7. webhook queue + DLQ;
8. event retrieval tool(s).

Webhook design must account for Pyrus's signed HTTPS POSTs, 60-second response requirement and retry behavior. citeturn142115search1turn142115search2

The plan must not assume API-driven webhook registration until research confirms it; Pyrus's standard bot documentation describes configuration by creating a bot and assigning a handler URL. citeturn142115search7

## Phase 11 — Persistence and distributed runtime

Introduce production persistence:

- PostgreSQL schema/migrations;
- token metadata;
- tenant configuration;
- webhook events;
- audit events;
- idempotency records;
- job/processing state;
- optional Redis for shared cache/rate limits;
- object-storage interface where necessary.

SQLite remains a local-development option only.

## Phase 12 — Observability and SRE

Implement:

- structured logs;
- metrics;
- traces;
- dashboards;
- alerts;
- SLOs/SLIs;
- dependency failure dashboards;
- per-tenant/tool latency metrics;
- audit reporting;
- incident/runbook templates;
- retention/redaction policy.

## Phase 13 — Security hardening

Complete:

- dependency vulnerability scanning;
- container scanning;
- secret scanning;
- SAST;
- DAST against staging;
- auth fuzzing;
- tenant-isolation tests;
- replay/idempotency tests;
- rate-limit abuse tests;
- SSRF/origin/proxy-header tests;
- oversized payload tests;
- malicious MCP argument tests;
- log-redaction tests;
- supply-chain review;
- backup encryption/recovery tests.

## Phase 14 — Staging and acceptance

Deploy the exact production image to staging.

Run:

- MCP protocol conformance tests;
- compatibility suite;
- sandbox integration suite;
- write-operation suite;
- webhook end-to-end suite;
- load test;
- failure injection;
- token rotation/revocation tests;
- database recovery test;
- deployment/rollback test.

Only the Human Architect can accept release readiness.

## Phase 15 — Production release

Production steps:

1. create release candidate;
2. build immutable image;
3. verify image digest;
4. deploy;
5. smoke test;
6. health/readiness gate;
7. compatibility smoke test;
8. observe error/latency budget;
9. complete release record;
10. monitor rollback criteria.

## Phase 16 — Knowledge MCP specification

Before implementing Knowledge MCP, freeze the contracts for:

- document identity;
- document/version lifecycle;
- authorship and review;
- evidence/lineage;
- chunking;
- embedding generations;
- hybrid retrieval;
- access policy;
- change sets;
- publication;
- Pyrus KB projection;
- rollback of publication;
- deprecation;
- audit trail.

## Phase 17 — Knowledge MCP implementation

Target stack:

- Python + FastMCP;
- PostgreSQL + pgvector;
- object storage for raw/large artifacts;
- background worker for embedding/index jobs;
- Redis only when justified by concurrency/queue needs;
- OpenTelemetry-compatible observability;
- same authentication/tenant principles as Pyrus MCP, but its own authorization scopes and data model.

Target capabilities:

- create/update/read document;
- version history;
- compare versions;
- approve/reject;
- search exact;
- search full text;
- search vector;
- hybrid search;
- retrieve context with citations;
- evidence lookup;
- relations/dependency graph;
- embedding status/reindex;
- publication candidate;
- publication status;
- rollback publication projection.

## Phase 18 — PyrusBot integration

Only after both MCPs have stable contracts:

- PyrusBot discovers Pyrus facts via Pyrus MCP;
- PyrusBot retrieves canonical docs via Knowledge MCP;
- PyrusBot proposes document changes;
- approval creates immutable Knowledge version;
- publication invokes Pyrus MCP;
- remote result is verified and stored as publication evidence.

## Phase 19 — Interface migration

The PyrusBot core becomes UI-neutral.

Adapters can later expose it through:

- chat bot;
- CLI;
- web UI;
- IDE extension;
- automation agent.

No interface migration is allowed to alter infrastructure contracts.

## Cross-phase rules

### Rule A — one task, one atomic outcome

A task is split when it contains multiple independently testable results.

### Rule B — new work from discovery becomes a task

Agents must create a linked task for every discovered gap. Silent scope expansion is forbidden.

### Rule C — executor cannot accept their own work

Every implementation task has an independent reviewer and at least one gate owner for security/QA where applicable.

### Rule D — phase completion is evidence-based

A phase is complete only when its exit criteria are green and no P0/P1 blocker remains unaccepted.

### Rule E — production is a separate product milestone

"Runs locally" and "61 tools pass mocks" do not equal production readiness.

## Parallelisation matrix

### Safe parallel work after Phase 3

- protocol shell;
- contracts recovery;
- observability foundation;
- domain models;
- docs/ADR work;
- individual read-only tool groups.

### Safe parallel work after Phase 5

- different domain tool groups;
- security test suite;
- compatibility fixtures;
- deployment infrastructure;
- Knowledge MCP specifications.

### Must remain sequential

- identity before authorization;
- authorization before protected tools;
- credential contract before client implementation;
- domain models before typed services;
- tool contract before tool implementation;
- read-only parity before write parity acceptance;
- parity before new features are declared compatible;
- staging before production;
- Knowledge MCP publication contract before PyrusBot auto-publish.
