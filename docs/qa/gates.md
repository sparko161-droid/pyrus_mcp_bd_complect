# Production Quality Gates v3

**Status:** Normative
**Owner:** AI CTO

No production code is merged or deployed without the applicable gates. The primary executor cannot be the sole reviewer or final gate owner.

## Gate 0 — Contract completeness

**Owner:** Pyrus Integrations Lead

Checks:

- the task has a versioned contract;
- the legacy compatibility catalogue exists for parity work;
- API endpoint and quirks are referenced by evidence;
- unknown behavior is explicitly marked unknown rather than guessed;
- the task is atomic and has a test/acceptance criterion.

No parity task may proceed while BLK-001/BLK-002 remain unresolved, except contract-recovery work itself.

## Gate 1 — Architecture

**Owner:** Chief Architect

Checks:

- transport, auth, tool, service and client boundaries are preserved;
- no tool contains raw Pyrus HTTP logic;
- tenant context is not user-argument-controlled;
- persistent state uses the approved repository interfaces;
- cross-cutting concerns are implemented once and reused;
- ADR is created for a material architectural deviation.

## Gate 2 — MCP Protocol

**Owner:** QA Lead

Checks:

- Streamable HTTP endpoint is correct;
- initialize/version/capability lifecycle works;
- protocol-version header is handled;
- JSON-RPC errors are valid;
- Origin validation is enforced;
- cancellation/timeout behavior is bounded;
- health/readiness works.

MCP Streamable HTTP requires a single MCP endpoint supporting POST/GET semantics and explicit security protections including Origin validation and authentication. citeturn755532search1

## Gate 3 — Identity/Security

**Owners:** Identity Security Lead + Security Agent

Checks:

- bearer access tokens are accepted only through the Authorization header;
- token audience, expiry, issuer and status are validated;
- scopes are enforced before business execution;
- tenant binding is enforced;
- revoked/expired tokens are rejected;
- 401 and 403 semantics are correct;
- no secrets appear in logs/errors;
- authentication metadata is available for HTTP MCP interoperability.

The MCP HTTP authorization model requires audience-bound access tokens and explicit handling of invalid/insufficient credentials. citeturn755532search0

## Gate 4 — Pyrus API Contract

**Owner:** Pyrus Integrations Lead

Checks:

- tool schema matches the recovered compatibility contract;
- Pyrus endpoint and HTTP method match evidence;
- request/response models are typed;
- `api_url` and `files_url` come from the tenant/account auth context;
- Pyrus errors and limits are handled;
- documented quirks are preserved;
- compatibility fixture passes.

Pyrus returns tenant-specific API/file URLs from authorization and expects a current access token on API calls. citeturn142115search0turn142115search4

## Gate 5 — Quality & QA

**Owner:** QA Lead

Required where applicable:

- unit tests;
- fixture/contract tests;
- integration tests against sandbox;
- boundary/edge cases;
- rate-limit behavior;
- timeout/retry behavior;
- partial-failure behavior;
- idempotency tests for writes;
- regression tests for every discovered bug.

`ruff`, type checking and test execution must be green.

## Gate 6 — Data/Migration

**Owner:** Data Engineer

Checks:

- schema migration is reversible where practical;
- indexes and constraints are defined;
- tenant isolation is encoded in data-access boundaries;
- backup/restore is tested;
- durable state is not stored only in the container filesystem;
- migration start-up/rollback semantics are documented.

## Gate 7 — Webhook

**Owner:** Security Agent + QA Lead

Checks:

- raw request body is available for signature verification;
- `X-Pyrus-Sig` verification passes/fails correctly;
- replay/idempotency protection exists;
- the endpoint acknowledges quickly;
- retries are safe;
- events are persisted before asynchronous processing;
- dead-letter behavior is testable.

Pyrus documents signed HTTPS webhook requests, a 60-second response requirement and retries after non-2xx responses. citeturn142115search1turn142115search2

## Gate 8 — Observability/SRE

**Owner:** DevOps Lead

Checks:

- structured logs;
- redaction;
- request correlation ids;
- metrics;
- latency/error dashboards;
- alerts;
- health endpoints;
- runbooks;
- SLO/alert mapping.

## Gate 9 — Security Hardening

**Owner:** Security Agent

Checks:

- dependency scan;
- image scan;
- secret scan;
- SAST;
- DAST on staging;
- auth fuzzing;
- cross-tenant fuzzing;
- SSRF/origin/proxy-header tests;
- oversized-payload tests;
- malicious MCP arguments;
- log-redaction regression.

## Gate 10 — Staging Acceptance

**Owner:** Release Manager

The exact production image must pass:

- MCP protocol suite;
- compatibility suite;
- sandbox write suite;
- webhook end-to-end suite;
- load test;
- failure injection;
- token rotation/revocation;
- database recovery;
- deployment/rollback drill.

## Gate 11 — Production Release

**Owner:** Human Architect

Required:

- immutable artifact digest;
- all previous gates green;
- release record;
- production smoke check;
- health/readiness green;
- rollback trigger documented;
- monitoring active.

## Knowledge MCP gates

### Knowledge Contract Gate

**Owner:** Knowledge Architecture Lead

Checks:

- document identity is stable;
- versions are immutable after approval;
- evidence and provenance are first-class;
- chunking is deterministic;
- embedding generation is versioned;
- retrieval returns citations/provenance;
- publication is downstream and reversible.

### Retrieval Quality Gate

**Owner:** Retrieval Engineer

Checks:

- exact lookup works for identifiers/codes;
- full-text search works;
- vector retrieval works;
- hybrid ranking works;
- metadata/tenant/version filtering works;
- recall/precision evaluation set exists;
- embeddings are traceable to a model generation.

### Publication Gate

**Owner:** Human Architect

Checks:

- only approved versions publish;
- source version is immutable;
- Pyrus target and remote ids are recorded;
- remote state is verified;
- failed publication cannot corrupt canonical knowledge;
- rollback projection is tested.

## Final synthesis

**Owner:** AI CTO

The AI CTO collects all gate results, checks dependency readiness and may stop the release for unresolved cross-cutting risk. Irreversible product/security/production decisions belong to the Human Architect.
## Phase Sign-Off Gate

**Owner:** Chief Architect & Human Architect

**Trigger:** Executed automatically at the conclusion of every Phase (when all tasks within the phase reach DONE).

**Checks:**
- **Structural Coherence:** Do all deliverables of this phase fit seamlessly into the overall ecosystem architecture?
- **Integration Readiness:** Are there any logical gaps, loose ends, or missing interfaces between the newly completed components and the existing system?
- **Documentation Parity:** Are all ADRs, schemas, and diagrams fully aligned with the actual code output of the phase?
- **Phase Exit Criteria:** Have the explicit exit criteria defined in \egistry.yaml\ been unambiguously met?

If any check fails, new tasks MUST be spawned in the backlog, blocking the start of the next phase until structural integrity is restored.
## Wave Gate (Macro Level)
**Owner:** Human Architect & AI CTO
**Trigger:** Before transitioning from one Wave of development to the next.
**Checks:**
- Wave deliverables meet global strategic objectives.
- Resource allocation and security posture for the next wave are approved.
- System integrity holds across all previously completed waves.

## Phase Architecture Gate
**Owner:** Chief Architect
**Trigger:** Start of any new Phase.
**Checks:**
- Technical approach for the Phase is validated via ADRs.
- No deviation from the Wave's strategic goals.

## Evolution & Compatibility Layer (Phase 1 Specific)
**Owner:** Pyrus Integrations Lead & Chief Architect
**Trigger:** Within Phase 1 (Product Threat Model & Identity).
**Checks:**
- Ensure any new Identity/Threat models do not break the 61 legacy contracts recovered in Phase 0.
- Evolution of data structures maintains 100% backward compatibility with pyrusBot and existing clients.
