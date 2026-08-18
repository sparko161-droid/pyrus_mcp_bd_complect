# Per-tool implementation work item

After Phase 0 recovery, every legacy tool gets its own work item. Grouped phase tasks are epics only and cannot be marked `DONE` while required per-tool items are missing.

## Required fields

```yaml
id: TOOL-<number>
phase: 7|8
epic: MCP-07x|MCP-08x
name: <legacy tool name>
domain: <domain>
primary: pyrus-integrations-lead
reviewer: qa-lead
gate_owners:
  - chief-architect
  - security-agent # required for writes/sensitive data

dependencies:
  - MCP-061 # domain model or equivalent
contract:
  mcp_schema_ref: contracts/pyrus-tool-catalog.yaml
  pyrus_api_ref: contracts/pyrus-api-inventory.yaml
  legacy_fixture_ref: tests/compatibility/fixtures/<tool>
  security_ref: docs/architecture/contracts-v2.md

implementation:
  tool_module: <path>
  service_method: <path>
  client_method: <path>
  model_refs: []

acceptance:
  - input_schema_matches
  - output_fixture_matches
  - error_cases_match
  - tenant_scope_enforced
  - logs_redacted
  - unit_tests_green
  - compatibility_test_green
  - sandbox_test_green_when_write

status: BLOCKED # until contract recovery is complete
```

## Required implementation chain

```text
legacy evidence
    -> tool contract
    -> Pydantic input/output models
    -> Service method
    -> PyrusClient method(s)
    -> MCP tool wrapper
    -> unit fixtures
    -> compatibility test
    -> security/tenant test
    -> reviewer
    -> gate owner
```

A tool work item is incomplete if it only adds an MCP decorator or only implements an HTTP call. The service/client boundaries must exist where the operation has reusable domain behavior.

## Write-tool extra requirements

Every write tool must additionally document:

- side effects;
- idempotency strategy;
- duplicate/retry behavior;
- partial failure semantics;
- minimum confirmation/guarding expected from the client;
- audit event;
- required scope;
- rollback or compensating action where feasible.

## Read-tool extra requirements

Every read tool must document:

- maximum result size;
- pagination/continuation behavior;
- stale-cache behavior if caching exists;
- tenant filtering;
- fields considered sensitive;
- provenance/remote identifiers where useful.

## Discovery rule

If implementation reveals behavior that is different from the recovered legacy evidence, do not silently change it. Open a compatibility-break task and an ADR decision where required.
