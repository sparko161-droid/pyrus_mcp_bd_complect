# Pyrus AI Ecosystem — MCP Infrastructure

This repository is the implementation and governance home for the **Pyrus MCP infrastructure service** and its supporting AI engineering team. It also contains the architectural specification and roadmap for the future **Knowledge MCP**, which is a separate service with its own data store and lifecycle.

## Product boundaries

```text
AI clients / employees
        |
        +---------------------+
        |                     |
        v                     v
   Pyrus MCP             Knowledge MCP
   Pyrus actions         canonical knowledge
        |                     |
        v                     v
     Pyrus API          PostgreSQL/pgvector
        ^                     ^
        |                     |
        +------- PyrusBot ----+
             orchestration
```

### Pyrus MCP

A production-grade external service that allows authorized employees/AI hosts to perform Pyrus operations over MCP. It is independently deployable and must not depend on a developer workstation.

### Knowledge MCP

A separate MCP service for canonical versioned documentation, evidence/lineage, semantic embeddings, hybrid retrieval and controlled publication to the Pyrus Knowledge Base through Pyrus MCP.

### PyrusBot

A future orchestration/application layer consuming both MCPs. It can later become a chat bot, CLI, web utility or IDE adapter without changing the infrastructure contracts.

## Current priority

**Pyrus MCP production readiness comes first.** Knowledge MCP is specified in parallel but is implemented after its contracts are approved. PyrusBot integration follows stable infrastructure contracts.

## Normative documents

- `IMPLEMENTATION_PLAN.md` — normative implementation entry point.
- `docs/architecture/system-architecture-v2.md` — complete system architecture.
- `docs/architecture/contracts-v2.md` — MCP, Pyrus API, security, webhook and Knowledge contracts.
- `docs/planning/production-roadmap-v2.md` — phase roadmap and parallelisation rules.
- `tasks/registry.yaml` — executable task graph with owners, reviewers, gates and dependencies.
- `contracts/pyrus-tool-catalog.yaml` — recoverable legacy compatibility catalogue; currently blocked until legacy evidence is recovered.
- `docs/qa/gates.md` — merge/release/production acceptance gates.
- `docs/ai-team/agent-registry.yaml` — engineering roles and authority.

## Critical current blockers

1. The previous plan referenced `pyrus_mcp_tools_spec.json` and `inventory.json`, but those artefacts are not present in the current repository. The exact legacy contract must be recovered before declaring 1:1 parity.
2. The visible plan says "61 tools", but the currently visible grouped list does not independently reconcile to that number. The exact legacy count and names are therefore a P0 contract-recovery task.
3. A single `SERVER_AUTH_TOKEN` is not an adequate multi-user production authorization model. The target is MCP/OAuth-compatible bearer authorization, audience validation, scopes, tenant binding, revocation and audit.
4. SQLite is a local-development option, not the durable production system of record.

## Engineering stack

### Pyrus MCP

Python 3.11+ policy; `uv`; FastMCP; Streamable HTTP; stdio for local tests; Pydantic; httpx; pytest; Ruff; static typing; PostgreSQL; optional Redis; Docker; GitHub Actions; external secret management.

### Knowledge MCP

Python + FastMCP; PostgreSQL + pgvector; object storage for large/raw artifacts; embedding-provider adapter with model/version records; background indexing/embedding jobs; optional Redis; the same production security and observability discipline.

## Development model

Every implementation item has one primary executor, an independent reviewer and explicit gate owners. A task is split whenever it contains more than one independently testable outcome. New discoveries create linked tasks rather than silently expanding scope.

Production release is gated by architecture, contract, security, QA, persistence, observability, staging and release checks.

## Useful commands

```bash
node scripts/dashboard-server.mjs
# Open http://localhost:4748/
```

The dashboard is an interface to the task registry; the registry and the documents above remain the source of truth.
