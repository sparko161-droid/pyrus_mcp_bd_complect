# Pyrus Enterprise MCP Server — Product Report

**Version:** `1.0.0`
**License:** Enterprise / MIT
**Date:** 2026-08-18

---

## 1. Product Vision & Overview
The **Pyrus Enterprise MCP Server** is a high-performance, secure, and observable bridge connecting modern AI agent platforms (Anthropic Claude Desktop, Cursor, OpenAI Agents, custom orchestrators) directly to the **Pyrus v4 API** and the **Solution Bank**.

It solves the fundamental problems of legacy script integrations:
1. **Zero-Trust Security & Multi-Tenancy:** Prevents cross-tenant data leaks by isolating sessions using cryptographic bearer tokens and tenant context variables.
2. **Reliability & Rate Limiting:** Handles upstream network drops and Pyrus rate limits (5,000 req/10m) through exponential backoff retry loops and a 50MB response ceiling.
3. **Observability:** Out-of-the-box JSON logging with automatic secret masking, `/metrics` endpoint for Prometheus, and pre-built operational runbooks.
4. **Autonomous Solution Bank:** Converts solved Pyrus incidents into permanent, searchable knowledge documents with bidirectional task provenance.

---

## 2. Key Functional Capabilities

### 2.1 Core Pyrus Management (1:1 Parity + Enhancements)
- **Tasks & Registers:** Read individual tasks with full comment histories, query multi-thousand task registries, create tasks, and submit multi-stage approvals.
- **Batch Processing:** Mass-update task fields or mass-close tasks in batches with granular partial-result error reporting.
- **Form Schemas:** Inspect form definitions with automatic LRU in-memory caching to save up to 90% of redundant API calls.
- **Catalogs & Members:** Explore organizational hierarchy, roles, and master catalog dictionaries.
- **Binary Attachments:** Stream base64 files directly to Pyrus `files_url` via multipart/form-data.

### 2.2 Solution Bank & Knowledge Ecosystem
- **Deterministic Chunking:** Header-aware document decomposition preserving markdown hierarchy.
- **Hybrid Retrieval:** Search solution patterns using lexical matching and semantic scoring.
- **Governance Lifecycle:** Full `DRAFT` -> `IN_REVIEW` -> `APPROVED` -> `PUBLISHED` workflow with immutable SHA256 revision history.
- **Pyrus KB Synchronization:** Push approved engineering playbooks directly into Pyrus announcement channels.

---

## 3. Technology Stack & Architecture
- **Language & Runtime:** Python 3.12 (Pinned)
- **Protocol:** Official Model Context Protocol (`mcp` SDK) over Server-Sent Events (SSE) and Stdio
- **Web Framework:** Starlette + Uvicorn
- **Persistence:** SQLite (`aiosqlite`) with WAL mode & Redis cache adapter
- **Observability:** `structlog` (JSON + Redaction) + `prometheus-client`
- **Deployment:** Multi-stage Docker, Docker Compose, non-root `mcpuser`
