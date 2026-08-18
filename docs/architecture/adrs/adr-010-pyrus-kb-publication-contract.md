# ADR 010: Knowledge Publication and Pyrus KB Sync Protocol

**Status:** Accepted
**Date:** 2026-08-18

## Context
When a knowledge document reaches `APPROVED` state in the Solution Bank, it must be synchronized into the official Pyrus Knowledge Base / Announcements / Form structure so human operators can access it directly in their Pyrus interface.

## Decision
1. **Publication Trigger (KM-007):**
   - Publication can only be invoked on documents with `lifecycle_state == 'APPROVED'`.
   - Requires scope `knowledge:publish` on the calling MCP client.
2. **Pyrus Sync Flow:**
   - Calls Pyrus MCP `upload_file` or updates form registry / announcement channels.
   - Records the external Pyrus entity ID (`pyrus_doc_id` or `announcement_id`) in `knowledge_evidence`.
3. **Rollback & Deprecation:**
   - If an error occurs during Pyrus API dispatch, the document status reverts to `APPROVED` and an audit event is logged.
