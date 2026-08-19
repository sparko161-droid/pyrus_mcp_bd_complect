# Pyrus MCP ecosystem — жёсткий аудит 2026-08

**Дата:** 2026-08-19  
**Статус:** нормативный audit baseline; все findings должны быть превращены в задачи или ADR  
**Объекты:** Pyrus MCP, Knowledge MCP / Solution Bank, PyrusBot integration, delivery/dashboard, AI team, iiko MCP roadmap

## 1. Executive verdict

Текущий репозиторий нельзя считать завершённым production parity release, несмотря на `DONE` у фаз 0–18. Исторический task registry и фактическая реализация расходятся по критическим контрактам.

### P0 — блокирует доверие к системе

1. **Pyrus API parity не доказан.** `contracts/pyrus-tool-catalog.yaml` прямо помечен `RECOVERED`, говорит об отсутствии исходного `pyrus_mcp_tools_spec.json`, не подтверждает точное число legacy tools и содержит `pyrus_endpoint: TODO` уже с `T-001`. При этом registry объявляет MCP-005/006/090/091/092 и parity gate завершёнными.
2. **Knowledge MCP имеет риск cross-tenant leakage.** `get_document()` и `search()` не принимают/не фильтруют tenant context; `create_knowledge_draft()` фактически использует default tenant. Это несовместимо с заявленным access-control контрактом.
3. **Knowledge retrieval фактически не hybrid.** Архитектура обещает PostgreSQL/pgvector + FTS + vector + graph/evidence, а код использует SQLite и `LIKE`, score всегда `1.0`. Это не просто недостающая оптимизация — это другой продуктовый контракт.
4. **Revision indexing сломан.** `submit_revision()` создаёт новую ревизию, но новые chunks не создаются. Поиск поэтому может возвращать старые chunks после обновления документа.
5. **Approval workflow не является workflow.** `approve_knowledge_revision()` игнорирует `reviewer_id`, а `update_state()` принимает произвольную строку без проверки допустимых переходов, роли, версии и audit evidence.
6. **Publication не публикует в Pyrus Knowledge Base.** Текущий код создаёт announcement через `/announcements`; нет publication record, remote hash, conflict detection, verification или rollback projection.
7. **CI не является quality gate.** MyPy и pytest завершаются через `|| echo`, поэтому типы и отсутствие тестов не блокируют merge.

### P1 — высокий риск качества/масштабирования

- Shared Pyrus client bypassed by `upload_file()`, который создаёт отдельный `httpx.AsyncClient`, поэтому теряются общие retry/rate-limit/error/circuit-breaker политики.
- File download возвращает только сформированный URL, а не ресурс/поток данных; нет единой политики доступа и size guard.
- Form cache process-local и tenant-unaware; invalidation не привязана к API/webhook changes.
- Registry endpoint не покрывает официальный набор фильтров и edge cases; `item_count` не решает 20k limit.
- Batch операции — локальные циклы, а не transaction-aware operations; idempotency/partial-failure policy недостаточно формализована.
- Tool registry не хранит per-tool scopes, read/write effect, API source, compatibility ID и evidence, хотя задача parity это требует.
- Knowledge schema отсутствует для embeddings, embedding generations, change sets, relations, publication records, review decisions, rejected/superseded states and retrieval audit.
- Hardcoded SQLite path prevents the target architecture of horizontally replaceable production service.

## 2. Why the current DONE state is invalid

`tasks/registry.yaml` is internally consistent as a historical execution log, but not as a truthful product-state source of truth. Examples:

- `MCP-005` — endpoint/quirk mapping is marked DONE, while the current contract catalogue still contains TODO endpoints.
- `MCP-016` — ADR set 001–012 marked DONE; ADR-012 is not present in the expected architecture set.
- `MCP-092` and `REV-009` — 1:1 parity frozen, while current tool modules implement only a subset of the claimed API surface.
- `KM-011` — PostgreSQL/pgvector schema marked DONE, while the actual dependency/runtime is `aiosqlite` and `knowledge_documents` are SQLite tables.
- `KM-015` — hybrid retrieval marked DONE, while actual search is SQL `LIKE` only.
- `KM-020` and `REV-017` — acceptance sign-off marked DONE despite the indexing, lifecycle and publication defects above.

Therefore the historical `DONE` statuses must remain as history but must not drive the release decision. The new audit overlay is the operative near-term execution layer.

## 3. Pyrus API compliance baseline

The current Pyrus API documentation defines a much larger v4 surface than the current code. The audit matrix is stored separately in:

`docs/audits/2026-08-pyrus-api-compliance-matrix.md`

Coverage rule:

- every official method is represented by one compatibility row;
- each row identifies endpoint, operation, expected MCP tool, source/legacy status, implementation status, quirks and test evidence;
- convenience methods added by this project are explicitly marked `PROJECT-ADDED` and never counted as legacy parity;
- API v3 is tracked as a separate compatibility contour, not silently mixed with v4.

Official Pyrus constraints that must be encoded in the client/tool contracts include bearer auth and tenant-specific `api_url/files_url`, ISO-8601 dates, omitted empty fields, structured errors, rate limit 5000 requests / 10 minutes / user, registry max 20,000 tasks per call, catalog and attachment/comment limits, and the documented webhook HMAC/retry contract.

## 4. Knowledge MCP — target operating model

The Solution Bank must become an actively learning system rather than a static document table.

### 4.1 Canonical lifecycle

```text
CASE CREATED
   -> EVIDENCE COLLECTED
   -> CASE NORMALIZED
   -> SOLUTION CANDIDATE
   -> HUMAN/AGENT REVIEW
   -> APPROVED KNOWLEDGE VERSION
   -> INDEXED
   -> AVAILABLE TO AGENTS
   -> USED IN NEW CASE
   -> FEEDBACK / SUCCESS / FAILURE
   -> NEW EVIDENCE OR REVISION
   -> SUPERSEDE / REINDEX
```

A case is not automatically knowledge. It first becomes an evidence-backed candidate.

### 4.2 Required entities

- `Case` — source operational problem/request.
- `CaseEvent` — comments, state changes, API responses, agent decisions, user corrections.
- `Evidence` — exact source fragment with immutable reference/hash.
- `SolutionCandidate` — proposed generalized solution.
- `KnowledgeDocument` — stable logical identity.
- `KnowledgeRevision` — immutable approved or rejected version.
- `KnowledgeChunk` — deterministic retrieval unit for one revision.
- `EmbeddingGeneration` and `KnowledgeEmbedding` — versioned vector records.
- `ChangeSet` — atomic review surface across related documents.
- `Relation` — links case, field, form, task, code, API endpoint, document and revision.
- `ReviewDecision` — who/when/why approved/rejected.
- `Publication` — exact mapping from canonical version to Pyrus KB remote object.
- `RetrievalEvent` — what version/chunk was returned to an agent and why.
- `FeedbackEvent` — whether the retrieved knowledge actually helped.

### 4.3 Ingestion rules

1. A closed Pyrus task is not sufficient evidence by itself.
2. Evidence should capture exact task/comment/form/API/commit references.
3. Normalization removes volatile noise but never alters source evidence.
4. A candidate may reference multiple cases; duplicates must merge into relations rather than duplicate documents.
5. Approval is version-level, not document-level mutable state.
6. Every approved version must be searchable lexically before vectorization and must expose embedding status.
7. Every retrieval result must identify `document_id`, `version_id`, `chunk_id`, score, match type and evidence references.
8. Feedback must be tied to retrieval events so usefulness can be measured.
9. Pyrus KB is a projection. Direct remote edits create a publication conflict, not silent overwrite.

### 4.4 Agent access

The agent should have two distinct read paths:

- `search_knowledge` — returns ranked evidence-backed candidates;
- `get_context` — assembles a bounded context pack from multiple candidates, preserving citations and tenant scope.

The context pack should carry:

```yaml
query_id
tenant_id
results:
  - document_id
    version_id
    chunk_id
    match_type
    score
    text
    source_refs
    freshness
    confidence
```

No agent receives raw unrestricted database dumps.

### 4.5 Learning loop

A solved case should trigger a post-resolution classifier:

- no reusable insight -> retain as case evidence only;
- known solution reused successfully -> increment usage/quality counters;
- novel solution -> create candidate;
- conflicting evidence -> create review item;
- outdated solution -> create supersession candidate.

A nightly/periodic job should produce a queue of high-value candidates based on frequency, failure cost, novelty, user correction rate and retrieval misses.

## 5. iiko MCP — architectural boundary

The third MCP must not copy the Pyrus MCP architecture blindly. It should reuse the platform layer but have an iiko-specific integration adapter and domain model.

Three contours must remain explicit:

1. **iiko Cloud API** — public cloud integration, token-based, HTTPS, API versions and account-scoped credentials.
2. **iikoServer / on-prem** — local/enterprise topology, version-dependent API and network/security constraints.
3. **MCP facade** — stable AI-facing tools, scopes, validation, pagination, retries, idempotency and audit independent of provider API naming.

The current official iiko documentation is partly rendered through dynamic API portals. Therefore an explicit `OFFICIAL-SNAPSHOT` gate is required before claiming complete endpoint parity. Working inventories may use maintained SDKs only as secondary evidence and must be reconciled to official documentation.

The detailed iiko method inventory and implementation plan is in:

`docs/architecture/iiko-mcp-v1-implementation-map.md`

## 6. Dashboard and governance correction

The dashboard now consumes the historical registry plus `tasks/2026-08-audit-overlay.yaml`.

The overlay is not a second source of truth for completed history. It is an executable correction layer containing:

- status overrides for findings that invalidate old sign-offs;
- new API parity tasks;
- Knowledge reliability tasks;
- iiko MCP foundation and method-mapping tasks;
- new AI team ownership tasks;
- new cross-phase architecture gates.

This allows the existing interactive dashboard to show the true active backlog without destroying the audit history.

## 7. Required architectural control between phases

A phase cannot be considered green solely because its local tasks are green.

Every phase now has three mandatory cross-phase gates:

1. **Boundary integrity review** — check public contracts, module boundaries and dependency direction.
2. **Documentation/code parity review** — compare architecture/ADR/README/contract docs to executable code.
3. **Future-compatibility review** — assess versioning, migration, rollback, extensibility and observability.

A failed gate creates a discovery task and blocks the downstream phase if the finding is P0/P1.

## 8. Team changes

The existing team is strong on generic backend/security delivery but underrepresented in API-contract auditing, knowledge quality and iiko domain semantics. New roles are defined in `docs/ai-team/roles.md`.

Mandatory new roles:

- API Contract Auditor;
- iiko Integration Lead;
- Knowledge Reliability Engineer;
- AI Evaluation Lead;
- Evidence & Case Curator;
- Architecture Red-Team Agent.

## 9. Release rule after this audit

The product should not be re-labeled 2.0/production-complete until all of the following are green:

- Pyrus official-method matrix = 100% mapped;
- all official methods implemented or explicitly marked out-of-scope by signed ADR;
- every tool has security scope + write effect + compatibility ID + fixture;
- Knowledge tenant isolation = 0 leakage;
- current-revision indexing and hybrid retrieval are green;
- approval/rejection/supersession are immutable and auditable;
- Pyrus KB publication uses the KB API and stores remote verification data;
- CI hard-fails on lint/type/test failures;
- iiko official snapshot has been captured and reconciled;
- architecture gate passes across Pyrus MCP, Knowledge MCP and iiko MCP;
- end-to-end agent benchmark demonstrates retrieval usefulness, citation correctness and no stale-version leakage.
