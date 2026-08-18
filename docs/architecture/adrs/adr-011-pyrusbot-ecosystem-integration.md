# ADR 011: PyrusBot Ecosystem Integration & Agent Workflows

**Status:** Accepted
**Date:** 2026-08-18

## Context
To close the loop between task execution in Pyrus and organizational learning in the Solution Bank, autonomous agents (PyrusBot, Cursor, Claude Desktop) need seamless end-to-end integration:
1. When a task is created or assigned, the agent needs automatic contextual knowledge retrieval with exact citations and provenance.
2. When a technical task is resolved, the agent should optionally harvest the resolution into an immutable Solution Bank draft.

## Decision
1. **Event Driven Context Dispatch (INT-001, INT-003):**
   - Webhook events received at `/webhook` trigger automated context enrichment: the system queries `search_knowledge` using the task's title and description.
   - Formatted context includes matching playbooks, relevant past incident solutions, and task citations.
2. **Autonomous Solution Harvesting (INT-002, INT-004):**
   - When an agent closes a task with action `finished` and a substantive comment, the bot publisher creates a `knowledge_draft` linked to the task ID in `knowledge_evidence`.
   - The draft enters `DRAFT` state for human/lead approval before being published to the Pyrus Knowledge Base.
3. **End-to-End Governance (INT-005):**
   - Full audit trail is maintained across the interaction pipeline with correlation IDs tracing the webhook, tool invocations, and database mutations.
