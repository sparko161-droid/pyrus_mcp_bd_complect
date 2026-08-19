# 2026-08 Red-Team Follow-up Audit

**Date:** 2026-08-19
**Status:** RELEASE-BLOCKED / NO-GO
**Rule:** `DONE` is not accepted without executable evidence.

## Executive verdict

The repository contains multiple cases where implementation, tests, CI gates and audit documentation claim completion while the actual code is still a stub, placeholder, mock, simulation or materially incomplete implementation.

This is a governance-level failure, not only a coding backlog.

## P0 findings

### RT-P0-001 — API contract drift checker is a guaranteed-pass stub
`./scripts/check-contract-drift.py` prints `passed (stub)` and exits 0 without reading or comparing any contract.

**Impact:** CI cannot detect Pyrus/iiko API drift. A green build is not evidence of contract compatibility.

**Required fix:** implement machine-readable source snapshot -> canonical registry -> implementation registry -> schema/endpoint/scope/risk diff; fail on unexpected drift; emit diff artifact.

### RT-P0-002 — Phase exit checker is a guaranteed-pass stub
`./scripts/check-phase-exit.py` contains placeholder logic and always exits 0.

**Impact:** phase and wave gates are ceremonial.

**Required fix:** enforce dependencies, required evidence, test execution, reviewer/gate identity, contract coverage, security gates, red-team decision and phase exit criteria.

### RT-P0-003 — `mark_all_done.py` can mass-forge completion
`./scripts/mark_all_done.py` rewrites PLANNED/READY/BLOCKED tasks to DONE.

**Impact:** task state is not trustworthy and can be corrupted by an intentional or accidental command.

**Required fix:** delete or quarantine the script; add CI deny rule for status-forging utilities; make DONE a derived/validated state.

### RT-P0-004 — Benchmark suite contains tests that only `pass`
`test_eval_c01_tool_selection.py`, `test_eval_c02_agent_retrieval.py`, `test_eval_c03_release_gates.py`, and `test_eval_c04.py` contain TODO/pass placeholders.

**Impact:** pytest reports these as passing tests while no behavior is evaluated.

**Required fix:** replace every benchmark with executable fixtures, assertions, thresholds and negative cases; remove `pass`/TODO placeholders from benchmark directories.

### RT-P0-005 — Final execution report falsely certifies incomplete implementation
`docs/audits/2026-08-final-execution-report.md` says the audit is `FULLY EXECUTED & APPROVED`, all tasks are DONE, benchmarks are implemented, and iiko foundations are live.

**Contradictions found:** contract/phase gates are stubs; benchmark tests are placeholders; iiko functions are not registered as MCP tools; Knowledge server exposes only one tool; staging drill is a simulation.

**Required fix:** invalidate this certification, replace it with evidence-backed status and link every claimed capability to test/evidence.

### RT-P0-006 — Historical QA audit is materially contradicted by source code
`docs/qa/reviews/project-full-audit.md` says `PASSED (100% Complete & Sealed)` and claims six Knowledge tools plus completed P17/P18. Current Knowledge server registers only `search_knowledge`.

**Required fix:** mark the report superseded/invalid, run a fresh audit generated from code introspection and executable tests.

### RT-P0-007 — Knowledge embedding fallback is an explicit mock
`knowledge_mcp_server/src/knowledge_mcp/server.py` creates `[0.0] * 1536` when no embedding is supplied and labels it a mock.

**Impact:** vector retrieval can return results without meaningful semantic query representation.

**Required fix:** inject a real versioned EmbeddingProvider; fail closed when unavailable; never expose mock behavior in production paths.

### RT-P0-008 — Knowledge retrieval returns fabricated quality metadata
`retrieval.py` sets `source_refs=[]`, `freshness=1.0`, and `confidence=1.0` for every result.

**Impact:** agents receive provenance/quality signals that are not measured.

**Required fix:** populate source relations, compute freshness from revision/publication timestamps, calculate confidence from measured retrieval evidence, and test the values.

### RT-P0-009 — iiko MCP is not actually mounted into the MCP server
`pyrus_mcp_server/src/iiko_mcp` contains functions but `pyrus_mcp/tools/__init__.py` never imports or registers the iiko module. No independent iiko MCP server exists.

**Impact:** claimed iiko MCP capability is not exposed through MCP.

**Required fix:** implement a real iiko MCP server/namespace, register typed tools, expose schemas, add protocol tests and separate provider adapters.

### RT-P0-010 — iiko implementation is explicitly stubbed and incomplete
`iiko_mcp/tools.py` contains `# -- Method Stubs --`, `# this is a stub`, and `# Placeholder`; only seven functions exist.

**Impact:** the claimed iiko API coverage is far below the documented implementation map.

**Required fix:** complete method registry first, then implement method-by-method contracts with fixtures and tests. Do not mark the implementation wave DONE until the registry is green.

### RT-P0-011 — iiko webhook uses hard-coded fake auth token and ignores event type
`create_webhook()` sends `authToken: "optional-token"` and does not use its `event_type` parameter.

**Impact:** incorrect webhook configuration and false contract surface.

**Required fix:** model the official webhook schema exactly, validate event selection, source token securely, and test round-trip settings.

## P1 findings

### RT-P1-001 — MCP tool input schemas are discarded during registration
`ToolRegistry` stores detailed `inputSchema`, but `register_tools()` registers only name/description and a generic `dict` handler.

**Impact:** clients may not receive the intended argument schema; tool discoverability and validation are degraded.

**Required fix:** register the exact JSON schema/typed Pydantic contract and add protocol-level `tools/list` snapshot tests.

### RT-P1-002 — Production transport contradicts the normative plan
Production compose and server use SSE; the project implementation plan defined Streamable HTTP as the production transport.

**Required fix:** resolve this as an explicit ADR backed by current MCP SDK support, then make transport selection and tests match the approved contract.

### RT-P1-003 — `/ready` is unconditional
`ready_check()` always returns `{"status":"ready"}` without checking DB, migrations or downstream dependencies.

**Required fix:** readiness must fail until required startup dependencies are available.

### RT-P1-004 — iiko client claims circuit breaking but implements none
`IikoClient` docstring says it handles circuit breaking; there is no circuit breaker implementation.

**Required fix:** implement a real circuit breaker or remove the claim and add a tracked resilience task.

### RT-P1-005 — iiko retry policy is not method-aware
A generic retry decorator retries network/rate-limit errors for GET/POST/PUT alike.

**Impact:** non-idempotent mutations can be duplicated.

**Required fix:** classify operations as safe/idempotent/non-idempotent; honor `Retry-After`; never automatically retry unsafe mutations without an idempotency key/transaction protocol.

### RT-P1-006 — iiko auth lifecycle is guessed, not provider-driven
Authentication assumes a one-hour token TTL and a single global credential set.

**Required fix:** use the current official provider contract, store provider-returned expiry, serialize concurrent refreshes, and bind credentials to tenant/account context.

### RT-P1-007 — iiko error logging dumps upstream response text
`IikoClient` logs `response.text` on HTTP errors.

**Impact:** potential PII/secrets/large payload leakage.

**Required fix:** structured, redacted error extraction with bounded body capture and secret/PII filtering.

### RT-P1-008 — iiko response-size guard only checks Content-Length
Chunked responses without Content-Length bypass the configured body-size guard.

**Required fix:** enforce an actual streaming byte limit before materializing the body.

### RT-P1-009 — Knowledge FTS is hard-coded to English
Schema and query use `english` text search configuration.

**Impact:** Russian-language knowledge retrieval quality is materially degraded.

**Required fix:** define explicit Russian/simple/multilingual FTS policy and benchmark recall/precision.

### RT-P1-010 — Knowledge embedding dimension is hard-coded to 1536
The schema fixes `vector(1536)` without a model/generation registry.

**Required fix:** model/provider/version/dimension metadata, generation table and migration-safe model rotation.

### RT-P1-011 — Knowledge MCP surface is far below its contract
The implementation exposes only `search_knowledge`; document lifecycle/publication/evidence/context tools from the architecture contract are absent.

**Required fix:** create a tool inventory test that compares declared contract -> registered MCP tools -> implementations -> tests.

### RT-P1-012 — Knowledge production service is not represented in production compose
`docker-compose.prod.yml` only deploys Pyrus MCP and Prometheus; Knowledge MCP is absent. Staging is likewise Pyrus-only.

**Required fix:** create deployable Knowledge service topology or explicitly declare it external and provide integration/health/deployment contracts.

### RT-P1-013 — Staging rollback drill is a simulation, not a drill
`scripts/staging-drill.ps1` prints success messages for migration idempotency, health checks and rollback without executing them; it references SQLite despite the production Knowledge target being PostgreSQL.

**Required fix:** make the drill execute real compose deployment, migration, smoke test, failure injection, rollback and post-rollback data checks against staging PostgreSQL.

### RT-P1-014 — DONE checker validates metadata, not evidence existence
`check-done-tasks.py` checks that evidence text exists and that dependency statuses are DONE. It does not verify referenced files/artifacts/tests actually exist or are valid.

**Required fix:** parse evidence references, validate hashes/artifacts, require passing CI run ids, reviewer/gate evidence, and reject placeholder evidence.

### RT-P1-015 — CI runs governance scripts that are themselves untrusted
Because drift/phase scripts are guaranteed-pass, CI gives false assurance even when those steps are green.

**Required fix:** harden the validators first and add mutation/negative tests that prove they fail on intentionally broken repositories.

### RT-P1-016 — Repository hygiene includes committed `node_modules` and debug dumps
The main tree contains `node_modules/` and a large `pyrusBot/.scratch_debug/` dataset/scripts collection.

**Risk:** repository bloat, accidental customer/runtime data exposure, polluted builds and non-reproducible dependencies.

**Required fix:** classify every tracked runtime/debug artifact; delete generated data, add root-level ignore rules, and keep only sanitized reproducible fixtures.

### RT-P1-017 — Environment workstation state is committed
`pyrusBot/.env_state.json` contains a workstation hostname and local validation state.

**Required fix:** remove runtime environment state from version control and add a generated-state deny rule.

## P2 findings

### RT-P2-001 — Knowledge package metadata is underdeveloped
`knowledge_mcp_server/pyproject.toml` lacks the project test/lint/type/benchmark configuration expected for an independent service.

### RT-P2-002 — Knowledge README is effectively empty
`knowledge_mcp_server/README.md` is only a few bytes and does not document installation, configuration, MCP tools, storage, migrations, or operational procedures.

### RT-P2-003 — Global singleton clients complicate multi-tenant isolation and testing
Pyrus/iiko clients/auth objects are module-level singletons. Replace with lifecycle-managed providers keyed by authenticated tenant/account context.

### RT-P2-004 — Tests focus heavily on mocks and single happy-path calls
Existing Pyrus tests verify isolated mocked client calls but do not prove MCP protocol schemas, real pagination/filter semantics, tenant enforcement or mutation safety.

## Required global completion rule

A task is not DONE unless all applicable evidence exists and is executable:

1. implementation code is non-placeholder;
2. no TODO/pass/fake-success path remains in production or gate code;
3. unit tests cover positive and negative paths;
4. integration/contract tests cover actual boundary behavior;
5. security tests cover tenant/authorization/write-risk cases;
6. CI executes the tests and fails on regression;
7. evidence references point to real artifacts;
8. independent reviewer and gate owner are recorded;
9. code/contract/docs/dashboard agree;
10. task status is derived from the gate, not manually asserted.

## Release decision

**NO-GO.** Phases 20–25 cannot be accepted as complete until the P0 findings are fixed and the affected P1 findings are either fixed or explicitly accepted by the Human Architect with compensating controls.
