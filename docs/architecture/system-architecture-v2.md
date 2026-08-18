# Pyrus MCP — Production System Architecture v2

**Status:** Proposed baseline for implementation
**Scope:** External multi-user Pyrus MCP server + Knowledge MCP architecture + integration boundary with PyrusBot

## 1. Product boundaries

The ecosystem has three separate products/services with explicit boundaries.

```text
AI clients / employees
        |
        +----------------------+
        |                      |
        v                      v
   Pyrus MCP              Knowledge MCP
   actions in Pyrus       versioned knowledge
        |                      |
        v                      v
     Pyrus API          canonical knowledge store
        ^                      ^
        |                      |
        +---------- PyrusBot --+
             orchestration / UX
```

Pyrus MCP is an infrastructure service. It must be deployable independently of PyrusBot and must not depend on a developer workstation.

Knowledge MCP is a separate infrastructure service. It owns canonical documentation, versions, retrieval and semantic indexing. Pyrus Knowledge Base is a publication target, not the canonical version store.

PyrusBot is an orchestration/application layer that consumes both MCPs. It is allowed to evolve into a chat, CLI, IDE or web utility without changing the two infrastructure products.

## 2. Pyrus MCP runtime architecture

```text
Internet / AI hosts
      |
      v
TLS / reverse proxy / WAF
      |
      v
MCP HTTP endpoint (/mcp)
      |
      +--> Origin + protocol-version validation
      |
      +--> OAuth 2.1 / bearer access-token validation
      |
      +--> scope + tenant + audience authorization
      |
      +--> request id / audit context
      |
      v
Tool layer
      |
      v
Service layer
      |
      +--> auth context / tenant context
      +--> validation
      +--> pagination / batching / cache
      +--> response-size guard
      +--> error translation
      |
      v
Pyrus API client
      |
      +--> token acquisition / refresh
      +--> api_url / files_url from Pyrus auth
      +--> retry / timeout / backoff
      +--> rate limiting
      +--> HTTP error mapping
      |
      v
Pyrus Cloud / Pyrus Datacenter
```

FastMCP is used for MCP protocol exposure. Streamable HTTP is the production transport. stdio is retained only for local developer validation. MCP's HTTP transport requires authentication and Origin validation, and clients use the negotiated MCP protocol version header on subsequent HTTP requests. citeturn755532search1turn755532search7

## 3. Authentication and authorization

The old plan's single `SERVER_AUTH_TOKEN` is not sufficient for a shared production service.

### 3.1 MCP protocol boundary

The production HTTP server follows the MCP HTTP authorization model: the server acts as an OAuth resource server; access tokens are presented using `Authorization: Bearer`; tokens are audience-bound; invalid/expired tokens return `401`; insufficient scopes return `403`; protected-resource metadata and authorization-server metadata are required for interoperable clients. citeturn755532search0

### 3.2 Application credential model

The operational model supports personal and service tokens while keeping the protocol boundary OAuth-compatible.

```text
Identity
  -> Client registration
  -> Authorization / consent
  -> Access token
  -> MCP resource audience
  -> scopes
  -> tenant bindings
```

Token records must contain at least:

- token id / family id;
- subject/user id;
- tenant/account id;
- scopes;
- audience/resource server id;
- issued-at / expiry;
- status: active/revoked;
- creation and last-use timestamps;
- rotation/revocation metadata.

Raw token values are never stored in logs. Persist only a one-way fingerprint/hash sufficient for lookup and revocation.

### 3.3 Required scopes

Minimum scope vocabulary:

- `pyrus:read`
- `pyrus:write`
- `pyrus:admin`
- `pyrus:files:read`
- `pyrus:files:write`
- `pyrus:webhooks:manage`
- `pyrus:diagnostics`

Knowledge-specific scopes belong to Knowledge MCP and are not required by Pyrus MCP.

Tool metadata must declare required scopes. Authorization occurs before business execution.

### 3.4 Tenant isolation

Every request resolves an immutable request context:

```text
request_id
subject_id
client_id
tenant_id / Pyrus account
scopes
source_ip / trusted proxy data
mcp_protocol_version
```

A tool must never infer tenant from user-controlled tool arguments when the identity context already contains a tenant binding.

Cross-tenant access requires an explicit administrative capability and a separately audited path.

## 4. Pyrus credential model

Pyrus authentication uses `login + security_key` to obtain an `access_token`; Pyrus returns `api_url` and `files_url`, and applications must be able to re-authorize because access tokens are limited-lived/revocable. A `person_id` may be required when one email is associated with multiple accounts. citeturn142115search0

The server therefore stores credentials per tenant/service identity, not as one global credential set.

```text
TenantCredential
  tenant_id
  pyrus_login
  encrypted_security_key
  person_id?
  api_url?
  files_url?
  credential_status
  rotated_at
```

Secrets must live in a secret manager or protected environment, never in Git or task payloads.

The runtime caches short-lived Pyrus access tokens in memory or a protected shared cache; source security keys remain in durable secret storage.

## 5. Tool contract architecture

Every Pyrus MCP tool has four contracts:

1. **MCP contract** — name, description, input JSON schema, structured output/error semantics.
2. **Service contract** — deterministic business behavior and domain validation.
3. **Pyrus API contract** — endpoint, HTTP method, request/response shape and documented Pyrus quirks.
4. **Security contract** — required scopes, tenant policy, data sensitivity, audit behavior.

A tool is not considered complete until all four exist.

## 6. Tool implementation pattern

```text
@tool
  validate input
  resolve Context
  authorize scope
  call Service
  map DomainResult -> structured MCP output

Service
  validate business invariants
  orchestrate one or more Pyrus calls
  apply pagination/cache/batch policy
  return typed domain result

PyrusClient
  HTTP request
  timeout
  retry policy
  auth token
  API URL
  rate limit
  error normalization
```

FastMCP supports request context and dependency injection, allowing auth/request state to remain outside the public tool schema. Lifespans provide server-level startup/teardown for shared resources. citeturn504311search1turn504311search0

## 7. Persistence

Pyrus MCP v1:

- PostgreSQL is the production system-of-record for identities, token metadata, tenant bindings, webhook events, audit events and durable server state.
- SQLite is allowed for local development only.
- Redis is optional for distributed token/cache/rate-limit state when horizontal scaling requires it.
- Object storage is used for durable diagnostic exports or large artifacts; secrets never enter object storage unless explicitly encrypted and designed for it.

The original "SQLite for v1" decision is retained only for local development. A public multi-user production server must not depend on a single container-local SQLite file.

## 8. Webhooks

Pyrus webhooks are push traffic into the MCP service and are not MCP tools themselves. Pyrus sends HTTPS POST requests, expects a 2xx response within 60 seconds, supplies `X-Pyrus-Sig` for authenticity verification, and may retry failed delivery. The server must verify the signature before accepting the event and must make ingestion idempotent. citeturn142115search1turn142115search2

Required flow:

```text
Pyrus POST /webhooks/pyrus
  -> verify X-Pyrus-Sig
  -> validate payload
  -> derive idempotency key
  -> persist event
  -> return 2xx quickly
  -> asynchronous processing
  -> expose events to authorized consumers
```

The implementation must not assume that webhook subscriptions can be created programmatically. Pyrus documentation describes configuring a bot and assigning a handler URL; this is therefore a research/contract task, not an assumed `register_webhook` API capability. citeturn142115search1turn142115search7

## 9. Reliability

Required production properties:

- request timeout per Pyrus endpoint class;
- bounded retry with exponential backoff and jitter;
- no retry for non-transient business errors;
- idempotency for write operations where possible;
- concurrency limits;
- global and tenant rate limits;
- circuit-breaker behavior for repeated Pyrus failures;
- response-size guards;
- graceful shutdown;
- readiness/liveness endpoints;
- startup validation of required configuration;
- connection pool limits;
- bounded webhook queue;
- dead-letter handling for permanently failing events.

## 10. Observability

Every request gets a correlation/request id.

Metrics:

- calls by tool;
- latency p50/p95/p99;
- errors by category;
- Pyrus 401/403/429/5xx;
- token refresh count;
- retry count;
- rate-limit waits;
- cache hit/miss;
- webhook accepted/rejected/retried/dead-lettered;
- active tenants and active sessions;
- database pool saturation.

Logs are structured JSON and must redact security keys, access tokens, authorization headers, cookies and sensitive Pyrus payload fields.

## 11. Deployment

Production is a containerized HTTP service behind a managed TLS termination/reverse proxy.

```text
GitHub
 -> CI
 -> image build
 -> image scan
 -> registry
 -> staging
 -> smoke / contract / integration / security tests
 -> approval gate
 -> production
 -> health gate
 -> rollback if unhealthy
```

Kubernetes is not required for v1. A single managed container platform is acceptable, provided the service has external persistent PostgreSQL, secret management, health checks, logs and a rollback mechanism.

## 12. Knowledge MCP boundary

Knowledge MCP is a separate service and should not share application database tables with Pyrus MCP.

Pyrus MCP owns operational calls to Pyrus.
Knowledge MCP owns knowledge lifecycle.

The integration is API/MCP-level only:

```text
PyrusBot
  -> Knowledge MCP: search/read/write/version
  -> approval workflow
  -> Pyrus MCP: publish approved artifact to Pyrus KB
```

## 13. Knowledge MCP logical architecture

```text
MCP tools/resources
      |
      v
Knowledge service
  +-- document service
  +-- version service
  +-- chunk service
  +-- retrieval service
  +-- publication service
  +-- access-control service
      |
      +------ PostgreSQL + pgvector
      |
      +------ object storage
      |
      +------ embedding provider
      |
      +------ optional Redis queue/cache
```

### Canonical entities

- `KnowledgeDocument`
- `KnowledgeVersion`
- `KnowledgeChunk`
- `KnowledgeEmbedding`
- `Evidence`
- `Relation`
- `Publication`
- `ChangeSet`
- `AccessPolicy`
- `EmbeddingModel`

A version is immutable after approval. Edits create a new version.

### Retrieval

Search must combine:

- exact/identifier search;
- metadata filtering;
- full-text search;
- vector similarity;
- source/evidence filtering;
- tenant/client filtering;
- version/status filtering.

The default ranking should be hybrid, not vector-only, because technical documentation contains exact field codes, form ids, catalog ids, function names and API endpoints where lexical matching is critical.

### Embedding lifecycle

```text
approved version
 -> canonical normalized text
 -> deterministic chunking
 -> embedding model/version recorded
 -> vectors written
 -> index ready
 -> retrieval enabled
```

Embedding model name, version, dimensions and generation timestamp belong to the stored embedding record. Model changes create a new embedding generation; old embeddings remain traceable until the reindex gate completes.

### Publication to Pyrus KB

Only approved versions may be published.

```text
Draft
 -> Review
 -> Approved
 -> Publish candidate
 -> Pyrus MCP write
 -> verify remote result
 -> Publication record
 -> Published
```

A Pyrus KB publication failure must never modify or delete the canonical Knowledge MCP version.

## 14. PyrusBot future role

PyrusBot becomes an orchestration shell:

- collects/clarifies requirements;
- invokes Pyrus MCP for facts/actions;
- invokes Knowledge MCP for context and canonical docs;
- delegates implementation to specialist agents;
- records evidence and decisions;
- eventually exposes the same orchestration engine through chat/CLI/web/IDE adapters.

The infrastructure contracts are intentionally independent from the eventual user interface.

## 15. Required architecture decision records

Before production implementation, ADRs must exist for:

- ADR-001 OAuth/token strategy;
- ADR-002 tenant model;
- ADR-003 Pyrus credential storage;
- ADR-004 PostgreSQL/Redis persistence boundary;
- ADR-005 webhook delivery semantics;
- ADR-006 idempotency model;
- ADR-007 observability stack;
- ADR-008 deployment platform;
- ADR-009 Knowledge MCP canonical storage;
- ADR-010 embedding model/versioning strategy;
- ADR-011 Pyrus KB publication contract;
- ADR-012 compatibility/versioning policy for 1:1 tool parity.

## 16. Hard non-goals

The following must not leak into the production MCP core:

- PyrusBot UI code;
- developer workstation state;
- client-specific business logic that belongs in PyrusBot/Knowledge MCP;
- secrets in source control;
- synchronous long-running webhook processing;
- direct database access by MCP tool implementations;
- ad-hoc per-tool HTTP clients;
- unreviewed "helpful" changes to the 61-tool compatibility surface.
