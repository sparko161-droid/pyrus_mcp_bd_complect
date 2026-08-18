# ADR 008: Knowledge Document Identity, Lifecycle, and Immutability

**Status:** Accepted
**Date:** 2026-08-18

## Context
The Solution Bank requires a knowledge management architecture where engineering playbooks, incident postmortems, solution patterns, and documentation can be authored by AI agents or human operators, versioned immutably, and verified before publication.

## Decision
1. **Document Identity:** Every knowledge document has a UUID `doc_id`, human-readable `slug`, `title`, `tenant_id`, and `lifecycle_state`.
2. **Lifecycle States:**
   - `DRAFT`: Initial creation or working revision.
   - `IN_REVIEW`: Submitted for peer/architect sign-off.
   - `APPROVED`: Accepted by human reviewer or authority agent.
   - `PUBLISHED`: Pushed to active search index and synchronized with Pyrus KB.
   - `DEPRECATED`: Superseded by a newer document version.
3. **Immutable Revisions:** Every change creates an immutable `revision_id` containing:
   - Full markdown body and SHA256 content checksum.
   - Author attribution (`agent_id` or `user_id`).
   - Creation timestamp (ISO 8601 UTC).
   - Parent revision ID for cryptographic lineage tracking.
4. **Evidence & Provenance:** Documents must support bidirectional links to Pyrus task IDs, form registry entries, and commit hashes.
