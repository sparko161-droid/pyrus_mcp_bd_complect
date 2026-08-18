# Wave 4 Full Audit, Task Specification & Execution Blueprint (W4: Knowledge Base & Ecosystem)

**Audit Date:** 2026-08-18
**Audit Lead:** Chief Architect, Knowledge Architecture Lead, DevOps Lead, Retrieval Engineer

---

## 1. Wave 4 Mission & Architecture Scope

Wave 4 extends the ecosystem beyond basic CRUD operations by building the **Solution Bank & Knowledge Subsystem**:
1. **Phase 16 (Knowledge Contracts & Schema):** Formal definitions for document identity, immutability, lineage, chunking, embedding versioning, hybrid retrieval contracts, and Pyrus KB publication rules (ADRs 008 - 012).
2. **Phase 17 (Knowledge MCP Service & Tools):** Implementation of the Knowledge storage subsystem in SQLite/PostgreSQL, chunking/indexing engine, semantic retrieval tools (`search_knowledge`, `get_knowledge_document`, `create_knowledge_draft`, `submit_knowledge_revision`, `publish_knowledge_to_pyrus`).
3. **Phase 18 (PyrusBot Ecosystem Integration):** End-to-end integration linking PyrusBot incoming webhooks, contextual retrieval with provenance, and automatic knowledge synchronization.

---

## 2. Phase 16 Task Breakdown (Contracts & Specifications)
- **KM-001:** Document identity & lifecycle contract (`draft` -> `review` -> `approved` -> `published` -> `deprecated`).
- **KM-002:** Immutable version/change-set contract (SHA256 content hashes, author attribution, semantic diffs).
- **KM-003:** Evidence/lineage/relation contract (linking knowledge documents to Pyrus Tasks, Forms, and external URLs).
- **KM-004:** Deterministic chunking contract (hierarchical header-based & sliding window token boundaries).
- **KM-005:** Embedding generation/version contract (model tags, dimensionality, cosine similarity baseline).
- **KM-006:** Hybrid retrieval contract (BM25 lexical + dense vector ranking reciprocal rank fusion).
- **KM-007:** Approval and publication-to-Pyrus contract.
- **KM-008:** Architectural decision set approval.

## 3. Phase 17 Task Breakdown (Implementation & MCP Tools)
- **KM-010:** Scaffold Knowledge service and models.
- **KM-011:** SQLite/PG migration for tables: `knowledge_documents`, `knowledge_revisions`, `knowledge_chunks`, `knowledge_evidence`.
- **KM-012:** Document, revision, and change-set persistence services.
- **KM-013:** Chunking and full-text/semantic indexing engine.
- **KM-014:** Embedding worker abstraction and model registry.
- **KM-015:** FastMCP tools: `search_knowledge`, `get_knowledge_document`.
- **KM-016:** FastMCP tools: `get_knowledge_evidence`, `get_document_lineage`.
- **KM-017:** FastMCP tools: `create_knowledge_draft`, `submit_knowledge_revision`, `approve_knowledge_revision`.
- **KM-018 & KM-019:** Pyrus Knowledge Base sync adapter (`publish_knowledge_to_pyrus`).
- **KM-020:** Knowledge test and acceptance suite.

## 4. Phase 18 Task Breakdown (PyrusBot Integration & Ecosystem)
- **INT-001 & INT-002:** Integration contracts.
- **INT-003:** Context retrieval with provenance for incoming bot queries.
- **INT-004:** Approved document publication workflow via Pyrus tasks.
- **INT-005:** Full end-to-end acceptance suite.
