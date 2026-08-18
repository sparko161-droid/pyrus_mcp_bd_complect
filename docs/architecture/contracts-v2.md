# Pyrus MCP Contract Catalogue v2

This file is the contract index for implementation. A contract is a prerequisite to coding, not a documentation task performed after coding.

## 1. Contract status model

`PROPOSED -> RESEARCH -> APPROVED -> IMPLEMENTED -> VERIFIED -> FROZEN`

A production change to a frozen contract requires an ADR, compatibility assessment and explicit Human Architect approval.

## 2. Missing-contract findings from the previous plan

The former `IMPLEMENTATION_PLAN.md` referred to `pyrus_mcp_tools_spec.json` and `inventory.json`, but those files are not present in the current repository. This is a documentation/contract blocker because the 1:1 parity claim cannot be independently reproduced from versioned repository data.

Required replacement:

- `contracts/pyrus-tool-catalog.yaml` — authoritative list of all compatibility tools;
- `contracts/pyrus-tool-contract.schema.json` — schema for each tool contract;
- `contracts/pyrus-tool-catalog.md` — human-readable catalogue generated from YAML;
- `contracts/pyrus-api-inventory.yaml` — source/API endpoint inventory;
- `contracts/legacy-compatibility-matrix.yaml` — old-server vs new-server behavior matrix.

## 3. MCP transport contract

### HTTP

Production endpoint: `/mcp`.

Requirements:

- HTTPS only at the public edge;
- Streamable HTTP;
- JSON-RPC 2.0 payloads;
- required `Accept` handling;
- MCP protocol version header handling;
- Origin validation against an explicit allowlist;
- request body and response size limits;
- connection/read/write timeouts;
- graceful cancellation;
- correlation id.

MCP Streamable HTTP requires an endpoint supporting POST and GET and warns explicitly about Origin validation and authentication. citeturn755532search1

### stdio

Supported only for local engineering and contract testing. No production secrets may be required to run static/schema tests.

## 4. Authentication contract

### Public discovery endpoints

The deployment must publish the metadata required for HTTP MCP authorization discovery.

### Access token

Every MCP HTTP request requires a bearer access token. Tokens are validated for:

- signature/cryptographic validity;
- issuer;
- expiry/not-before;
- intended audience/resource;
- subject;
- client id;
- required scopes;
- tenant binding;
- token status/revocation.

MCP authorization requires bearer tokens in the Authorization header and audience validation; invalid tokens are `401`, insufficient scope is `403`. citeturn755532search0

## 5. Authorization contract

Each tool declares:

```yaml
required_scopes: [pyrus:read]
data_class: internal
write_effect: false
audit_event: tool.pyrus.get_form
```

The authorization engine denies by default.

Administrative overrides must be explicit, scoped, time-bound where possible, and audited.

## 6. Tenant contract

A tenant is a logical Pyrus account/configuration boundary.

```yaml
tenant_id: stable-internal-id
pyrus_account_id: optional
credential_ref: secret-manager-reference
allowed_users: subject bindings
allowed_scopes: maximum scope set
```

Every Pyrus API request is built from the authenticated tenant context. User-supplied `api_url`, credential and tenant parameters are rejected for normal calls.

Per-call routing overrides are permitted only for an explicit migration/diagnostic scope and must be audited.

## 7. Pyrus credential contract

Pyrus `/auth` accepts `login`, `security_key` and may require `person_id`; the response provides `access_token`, `api_url` and `files_url`. Token lifetime is limited and revoked tokens require re-authorization. citeturn142115search0

The abstraction therefore exposes:

```python
class PyrusCredentialProvider:
    async def get_access_token(tenant_id: str) -> AccessToken: ...
    async def refresh_access_token(tenant_id: str) -> AccessToken: ...
    async def get_api_urls(tenant_id: str) -> PyrusUrls: ...
```

The provider never returns a raw security key to tool code.

## 8. Pyrus HTTP client contract

```python
class PyrusClient:
    async def request(...): ...
    async def get(...): ...
    async def post(...): ...
    async def put(...): ...
    async def delete(...): ...
```

The client owns:

- authorization header injection;
- base URL selection;
- file URL selection;
- connect/read/write timeout policy;
- retry classification;
- backoff/jitter;
- rate-limit accounting;
- tracing/correlation ids;
- HTTP status normalization;
- safe response decoding.

Tools and services must not implement raw HTTP transport logic.

## 9. Error contract

Internal error taxonomy:

```text
AuthenticationError
AuthorizationError
TenantContextError
ValidationError
PyrusNotFoundError
PyrusConflictError
PyrusRateLimitError
PyrusTransientError
PyrusUpstreamError
ResponseTooLargeError
IdempotencyConflictError
WebhookSignatureError
WebhookReplayError
PersistenceError
UnknownIntegrationError
```

MCP-facing errors must preserve machine-readable category/code while giving the model a concise recovery hint. Secrets and raw upstream authorization data are forbidden in error messages.

## 10. Idempotency contract

All write operations must declare whether they are:

- naturally idempotent;
- client-idempotent using an idempotency key;
- non-idempotent and therefore protected by explicit confirmation/guarding.

For batch operations each item receives independent result status when partial completion is possible.

## 11. Pagination contract

Every collection operation declares:

- native upstream pagination support;
- service-level pagination fallback;
- maximum page size;
- maximum aggregate size;
- truncation semantics;
- stable ordering requirement;
- continuation token/cursor behavior if applicable.

No tool may silently return a partial collection.

## 12. Response-size contract

Responses must declare a bounded response policy. When a result exceeds a configured size:

- return a structured truncation indicator when the operation supports pagination;
- otherwise return a validation/recovery error explaining the narrowing parameters.

## 13. File contract

File-related tools must specify:

- whether they return metadata or content;
- maximum supported sizes;
- streaming behavior;
- files URL selection;
- filename/path normalization;
- MIME validation;
- tenant access checks;
- temporary URL lifetime handling.

Pyrus exposes `files_url` separately from `api_url`; the server must use the value returned for the tenant/account instead of hardcoding Cloud-only endpoints. citeturn142115search0turn142115search4

## 14. Webhook contract

Public route: `POST /webhooks/pyrus`.

Required processing:

1. read raw request body;
2. verify `X-Pyrus-Sig` using the tenant/bot secret;
3. reject malformed/replayed events;
4. compute idempotency key;
5. persist the event;
6. return 2xx quickly;
7. process asynchronously.

Pyrus documents `X-Pyrus-Sig`, retry behavior and the 60-second response requirement. citeturn142115search1turn142115search2

## 15. Health contract

Endpoints:

- `GET /health/live` — process is alive;
- `GET /health/ready` — service dependencies are available enough to accept traffic;
- `GET /health/version` — deployment version/commit, with no secrets.

Readiness must validate only dependencies that are required for serving traffic; it must not perform expensive Pyrus calls on every probe.

## 16. Observability contract

Every request emits a structured event containing:

```yaml
request_id
trace_id?
subject_id
client_id
tenant_id
tool
started_at
duration_ms
outcome
error_code?
upstream_status?
```

Sensitive fields are redacted before serialization.

## 17. Compatibility contract for the 61-tool parity set

For every legacy tool the compatibility matrix stores:

```yaml
tool: get_form
legacy_name: get_form
legacy_input_schema_hash: ...
legacy_output_shape_hash: ...
legacy_error_cases: ...
pyrus_endpoint: GET /forms/{form-id}
new_mcp_name: get_form
new_input_schema_hash: ...
compatibility_status: exact|compatible|breaking|unknown
```

Compatibility is established by:

1. repository contract;
2. legacy live-call/fixture evidence;
3. official Pyrus API verification;
4. new implementation fixture;
5. automated diff test;
6. human API contract approval.

No tool is marked `VERIFIED` without all six where applicable.

## 18. Knowledge MCP document contract

Canonical document metadata:

```yaml
document_id: immutable identifier
client_id: optional client boundary
domain: form|bot|catalog|process|project|guide|rule
path: canonical logical path
status: draft|review|approved|deprecated
current_version: immutable version id
owners: []
reviewers: []
source_refs: []
created_at: ...
updated_at: ...
```

Version metadata:

```yaml
version_id
parent_version_id
content_hash
schema_version
author
change_set_id
created_at
approval_status
approved_by
approved_at
```

Version content is immutable after approval.

## 19. Knowledge chunk contract

A chunk stores:

- version id;
- deterministic ordinal/path;
- normalized text;
- character/token boundaries;
- heading hierarchy;
- source refs;
- content hash;
- embedding generation id.

Chunking must be deterministic so that the same version produces the same chunk identity.

## 20. Knowledge embedding contract

```yaml
embedding_generation_id
model_provider
model_name
model_version
dimensions
chunk_id
generated_at
status: pending|ready|failed|superseded
```

A re-embedding operation never mutates the historical generation in place.

## 21. Knowledge retrieval contract

Minimum retrieval API capabilities:

- exact id/code lookup;
- keyword/FTS search;
- vector search;
- hybrid search;
- metadata filters;
- version/status filters;
- client/tenant filters;
- top-k;
- score/citation metadata;
- evidence references.

Returned context must include enough provenance for the AI agent to cite the exact document/version/chunk used.

## 22. Publication contract to Pyrus KB

Only `approved` versions can become `publish candidates`.

A publication transaction records:

- source version id;
- target Pyrus account;
- target KB article id/parent;
- published content hash;
- published timestamp;
- actor/service token;
- result;
- remote verification result.

Publication is a downstream projection. A failed publication never corrupts canonical knowledge.
