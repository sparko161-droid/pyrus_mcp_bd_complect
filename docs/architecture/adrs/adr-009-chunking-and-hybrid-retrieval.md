# ADR 009: Deterministic Chunking and Hybrid Retrieval Contract

**Status:** Accepted
**Date:** 2026-08-18

## Context
AI agents need high-precision semantic lookup over the solution bank. Pure vector search misses exact technical keywords (e.g. error codes, UUIDs, function signatures), while pure keyword search misses semantic conceptual queries.

## Decision
1. **Deterministic Chunking (KM-004):**
   - Header-aware markdown splitting (H1, H2, H3).
   - Target chunk size: 500-1000 tokens with 100 token overlap.
   - Each chunk retains document metadata, header path breadcrumbs, and parent revision hash.
2. **Embedding & Vector Representation (KM-005):**
   - Vector dimensions: 768 / 1536 depending on active embedding model provider.
   - Model version tagged on every chunk to allow deterministic re-indexing.
3. **Hybrid Search Algorithm (KM-006):**
   - Combines BM25 lexical full-text search with vector cosine similarity using Reciprocal Rank Fusion (RRF):
     $$RRF(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$
     where $k=60$, $r_m(d)$ is the rank in search modality $m$.
