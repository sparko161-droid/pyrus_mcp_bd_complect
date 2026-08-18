# AGENTS.md — Pyrus MCP Server Constitution v2

## Mission
Build the `pyrus_mcp` Python server as a production-grade external MCP integration for multiple authorized employees/AI hosts, replacing the closed-source Railway service.

The same repository also defines the future Knowledge MCP architecture. Knowledge MCP is a separate service and datastore; it is not a module inside Pyrus MCP.

## Authority
**Human Architect** is the final authority for product, architecture, security and production release.
**AI CTO** orchestrates agents and resolves cross-team dependencies.
**Chief Architect** owns technical architecture.

## Normative sources
Read these before implementation:

1. `IMPLEMENTATION_PLAN.md`
2. `docs/architecture/system-architecture-v2.md`
3. `docs/architecture/contracts-v2.md`
4. `docs/planning/production-roadmap-v2.md`
5. `tasks/registry.yaml`
6. `docs/qa/gates.md`
7. `docs/ai-team/agent-registry.yaml`

For parity work, use `contracts/pyrus-tool-catalog.yaml`. It is currently a recovery scaffold and is **not authoritative** until Phase 0 contract recovery is approved.

Do not reference absent or unversioned contract files as if they were sources of truth.

## Before coding

1. Read the applicable phase and task from `tasks/registry.yaml`.
2. Read the relevant architecture and contract document.
3. Check all declared dependencies.
4. Search the repository for an existing implementation before introducing a new abstraction.
5. If a requirement or contract is missing, create a discovery task and block the affected implementation instead of guessing.

## Phase discipline

Follow `IMPLEMENTATION_PLAN.md` and `tasks/registry.yaml`.

Do not implement a compatibility tool before its Pyrus API contract, MCP contract, security contract and fixture evidence exist.

Do not implement public multi-user access using a single global `SERVER_AUTH_TOKEN`.

Do not use SQLite as the durable production store.

## Architecture rules

Required production path:

```text
MCP tool -> Service -> PyrusClient -> Pyrus API
```

Cross-cutting auth/tenant context is injected by the request/security layer. Tools must not parse or store raw credentials themselves.

Database access occurs through repository/data-access layers, not directly from MCP tool functions.

Webhooks are HTTP ingestion endpoints, not MCP tool calls.

## Quality rules

A feature cannot be completed without:

- typed input/domain validation;
- unit tests;
- appropriate integration/compatibility tests;
- independent review;
- applicable security/architecture/QA gates;
- documented evidence.

The executor cannot be the sole reviewer or final gate owner.

## Compatibility rules

1. Legacy parity is exact unless an explicit ADR approves a difference.
2. Never silently "improve" legacy behavior while claiming 1:1 compatibility.
3. Unknown legacy behavior is recorded as unknown and recovered through evidence.
4. After Phase 0, every legacy tool gets its own atomic implementation work item using `tasks/per-tool-work-item-template.md`.

## Security rules

Never expose:

- `PYRUS_SECURITY_KEY`;
- access tokens;
- refresh credentials;
- authorization headers;
- secret-manager values.

Never put secrets in Git, logs, task payloads or compatibility fixtures.

Never access production Pyrus during development. Use sandbox/mocks unless the Human Architect explicitly approves a controlled production verification.

## Discovery rule

When an agent discovers an incomplete contract, additional method, dependency, security issue, production concern or inconsistent behavior:

1. create a new task;
2. link it to the discovering task;
3. set the correct priority;
4. mark the current task `BLOCKED` if the discovery prevents correct completion;
5. record evidence;
6. escalate decisions through AI CTO / Human Architect as required.

Silent scope expansion is prohibited.
