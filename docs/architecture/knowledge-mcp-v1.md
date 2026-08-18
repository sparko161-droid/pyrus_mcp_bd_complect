# Knowledge MCP v1 — Architecture and Contract

## 1. Purpose

Knowledge MCP is the canonical knowledge infrastructure for the Pyrus AI ecosystem. Its responsibility is not to execute Pyrus business operations. Its responsibility is to preserve, version, retrieve, validate and publish knowledge.

## 2. Source-of-truth rule

```text
Knowledge MCP = canonical source
Pyrus Knowledge Base = published projection
PyrusBot = author/orchestrator
Pyrus MCP = publication/action transport
```

A Pyrus KB article is never treated as the only canonical copy after Knowledge MCP is introduced.

## 3. Data model

### KnowledgeDocument

Stable identity for a logical artifact.

Examples:

- client form specification;
- routing specification;
- bot specification;
- catalog documentation;
- project rule;
- engineering guide.

### KnowledgeVersion

Immutable content revision. It points to parent version and records author, reviewer, content hash, schema version and approval state.

### KnowledgeChunk

Deterministic retrieval unit derived from one version. Chunk identity includes the version and deterministic path/ordinal.

### KnowledgeEmbedding

Vector representation for one chunk and one embedding generation. The model provider/name/version/dimensions are stored with the record.

### Evidence

A source that supports a claim or specification section:

- Pyrus API response;
- code file/commit;
- customer-confirmed decision;
- external official documentation;
- test result;
- publication result.

### Relation

Explicit graph relation such as:

```text
form -> bot
form -> catalog
field -> script
bot -> external API
requirement -> document section
version -> parent version
publication -> Pyrus article
```

## 4. Version lifecycle

```text
DRAFT
  -> REVIEW
  -> APPROVED
  -> PUBLISHING
  -> PUBLISHED
  -> SUPERSEDED
```

Rejected edits become `REJECTED` and do not replace the current approved version.

Approved versions are immutable.

## 5. Change sets

One user/agent request may modify several related documents. A `ChangeSet` groups these changes and provides a single review/approval surface.

A change set records:

- request/problem statement;
- affected documents;
- proposed impact;
- authoring agent/person;
- reviewers;
- tests/evidence;
- approval decision;
- publication decision.

## 6. Retrieval architecture

Retrieval is intentionally hybrid.

```text
query
  |
  +--> exact identifiers/codes
  +--> PostgreSQL FTS
  +--> vector similarity
  +--> metadata filters
  +--> graph/evidence constraints
  |
  v
candidate union
  |
  v
hybrid ranker
  |
  v
provenance-rich context
```

Vector-only retrieval is explicitly insufficient for technical Pyrus knowledge because exact identifiers, field codes, form ids, catalog ids, endpoint names and function names have high semantic importance.

## 7. Retrieval response

Every result must include:

```yaml
document_id
version_id
chunk_id
title
text
score
match_type: exact|fts|vector|hybrid
source_refs
```

AI agents must be able to navigate from a retrieved chunk to the exact version and supporting evidence.

## 8. Embedding pipeline

```text
approved version
 -> normalize
 -> deterministic chunk
 -> calculate content hash
 -> enqueue embedding job
 -> generate vectors
 -> write generation record
 -> activate index
```

Embedding generation is asynchronous. A version is searchable lexically before embeddings are ready, but the UI/API must expose embedding status explicitly.

## 9. Re-embedding

Embedding model migrations are first-class operations.

```text
model-v1 active
model-v2 generated in parallel
    -> evaluation
    -> full index readiness
    -> switch default generation
    -> retain v1 for rollback window
```

Old vectors are never silently overwritten.

## 10. Access control

Knowledge is tenant/client scoped by default.

The access policy applies before retrieval and again before returning source text. A result from another client must not leak merely because its embedding is similar.

Suggested scopes:

- `knowledge:read`
- `knowledge:search`
- `knowledge:write`
- `knowledge:approve`
- `knowledge:publish`
- `knowledge:admin`

## 11. Publication to Pyrus KB

Publication happens only for `APPROVED` versions.

```text
Knowledge MCP
   |
   | publish candidate
   v
Pyrus MCP
   |
   | create/update KB article
   v
Pyrus KB
   |
   | verify
   v
Publication record in Knowledge MCP
```

A publication record stores source version, target account, remote id, remote hash, actor, timestamps and verification result.

## 12. Publication conflict policy

If a remote Pyrus KB article changed independently since the last publication, automatic overwrite is forbidden.

The system creates a `PUBLICATION_CONFLICT` with:

- canonical source version;
- last published remote hash;
- current remote hash;
- detected diff;
- recommended resolution.

Human approval is required for destructive reconciliation.

## 13. MCP surface

Knowledge MCP should expose at minimum:

### Tools

- `create_document`
- `create_change_set`
- `update_document`
- `get_document`
- `get_version`
- `list_versions`
- `compare_versions`
- `submit_for_review`
- `approve_version`
- `reject_version`
- `search_knowledge`
- `get_context`
- `get_evidence`
- `list_relations`
- `reindex_document`
- `get_embedding_status`
- `create_publication_candidate`
- `publish_to_pyrus_kb`
- `get_publication_status`
- `resolve_publication_conflict`

### Resources

Resources should be used for read-oriented canonical artifacts where a client benefits from a stable URI-like representation, while tools perform mutations and searches.

MCP distinguishes tools, resources and prompts by control and intent; Knowledge MCP should keep read context and mutation permissions separate. citeturn755532search4

## 14. Storage stack

Production baseline:

- PostgreSQL;
- pgvector extension;
- object storage adapter where files/raw exports are large;
- worker process for embedding/indexing;
- Redis optional for queue/cache only when load requires it.

The Knowledge MCP service owns its schema. Pyrus MCP cannot read its tables directly.

## 15. Quality model

Knowledge retrieval requires a benchmark set.

The benchmark contains questions such as:

- "Which bot writes field X?"
- "What breaks if catalog row Y is renamed?"
- "What version approved this routing rule?"
- "Which Pyrus API evidence supports this field?"
- "Which client owns this form?"

Evaluation dimensions:

- exact match accuracy;
- recall@k;
- citation correctness;
- tenant leakage = zero;
- stale-version rate;
- publication verification success.

## 16. Relationship to PyrusBot

PyrusBot should ask Knowledge MCP for evidence-backed context rather than relying on conversation history as canonical state.

When it proposes a documentation improvement:

```text
agent proposal
 -> ChangeSet
 -> affected documents
 -> evidence
 -> review
 -> approved version
 -> optional Pyrus KB publication
```

This gives the AI team traceability instead of an opaque mutable prompt memory.
