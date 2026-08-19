# Ecosystem Roadmap v3 — 2026-08

## North Star

Build three production MCP services with explicit boundaries:

```text
                    ┌───────────────┐
                    │   PyrusBot    │
                    │ orchestration │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              v             v             v
        ┌──────────┐  ┌─────────────┐  ┌──────────┐
        │ Pyrus    │  │ Knowledge   │  │ iiko MCP │
        │ MCP      │  │ MCP         │  │          │
        └────┬─────┘  └──────┬──────┘  └────┬─────┘
             │               │              │
             v               v              v
          Pyrus API        Canonical      iiko Cloud /
                           knowledge      iikoServer
```

## Wave 0 — Truth recovery

Before new implementation, establish one trusted baseline:

- Pyrus official v4 endpoint snapshot;
- Pyrus legacy/source MCP provenance;
- iiko Cloud official snapshot;
- iikoServer API snapshot/capability matrix;
- code/docs/task registry coherence;
- security and tenant boundary review.

Exit condition: no unresolved P0/P1 contradiction between task state, docs and code.

## Wave 1 — Pyrus API parity reset

1. Complete method matrix.
2. Implement every missing official method.
3. Normalize all request/response/field schemas.
4. Add method-level fixtures and compatibility tests.
5. Attach scopes, write effects, retry and idempotency metadata to every tool.
6. Generate a machine-readable coverage report.

Exit condition: 100% official methods either green or explicitly ADR-scoped out.

## Wave 2 — Knowledge MCP becomes operational

### Data lifecycle

```text
Pyrus case/event
 -> evidence
 -> normalized case
 -> candidate
 -> review
 -> immutable version
 -> lexical index
 -> embedding index
 -> agent retrieval
 -> feedback
 -> improvement/supersession
```

### Implementation order

1. tenant-safe context;
2. immutable version lifecycle;
3. PostgreSQL/pgvector production schema;
4. reindex worker and embedding registry;
5. hybrid retrieval + evidence/citations;
6. case ingestion;
7. candidate generation;
8. review/approval;
9. verified Pyrus KB publication;
10. retrieval feedback/evaluation.

Exit condition: a closed real case can enter the bank, be reviewed, become searchable, be retrieved by an agent with citations, and later be improved without corrupting history.

## Wave 3 — iiko MCP contract recovery

1. Official Cloud snapshot.
2. Official iikoServer snapshot.
3. Auth transition verification.
4. Full method matrix.
5. Cloud/Server capability map.
6. Error/limit/idempotency catalog.
7. Fixture and schema generation.

Exit condition: every endpoint has authoritative source evidence.

## Wave 4 — iiko MCP implementation

- client/auth core;
- organization/reference data;
- nomenclature/menu/stoplists;
- terminal/employee/health;
- orders;
- delivery;
- reservations;
- loyalty/customer;
- mutations;
- webhooks/events;
- observability.

Write operations are implemented only after read models, error semantics and idempotency are proven.

## Wave 5 — Ecosystem controls

Cross-MCP architecture review becomes a first-class recurring activity.

Required reviews:

- public contract coherence;
- security/tenant isolation;
- docs/code parity;
- versioning/migration compatibility;
- observability and rollback;
- knowledge provenance;
- API drift.

## Wave 6 — Agent evaluation

Benchmarks must test behavior, not only endpoint reachability.

### Pyrus

- correct method selection;
- correct field serialization;
- safe mutation confirmation;
- correct pagination/filter use.

### Knowledge

- recall@k;
- citation correctness;
- stale-version rate;
- tenant leakage = zero;
- usefulness after feedback;
- unsupported answer rate.

### iiko

- correct Cloud/Server route;
- correct organization context;
- safe order/delivery/payment mutation;
- idempotency/replay handling;
- bounded result handling.

## Wave 7 — Release gate

No production completion while any of these are open:

- unverified parity claim;
- cross-tenant risk;
- stale current-version retrieval;
- unverified publication;
- non-blocking CI test/type gates;
- undocumented iiko auth/API drift;
- architecture contradiction across MCPs.

## Execution source of truth

- Historical execution log: `tasks/registry.yaml`.
- Current correction/expansion queue: `tasks/2026-08-audit-overlay.yaml`.
- Interactive board: `scripts/dashboard/` + `scripts/dashboard-server.mjs`.
- Pyrus matrix: `docs/audits/2026-08-pyrus-api-compliance-matrix.md`.
- iiko map: `docs/architecture/iiko-mcp-v1-implementation-map.md`.
- Full audit: `docs/audits/2026-08-full-system-audit.md`.

The overlay must be removed or merged into the main registry only after its tasks become independently evidenced. It must never be silently deleted.
