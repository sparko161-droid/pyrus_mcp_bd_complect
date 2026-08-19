# ADR-013: PyrusBot UI-Neutral Orchestration Core and Adapter Contracts

**Status:** Accepted
**Date:** 2026-08-19

## Context

Historically, PyrusBot existed as a set of markdown-based AI agent instructions (`AGENTS.md`, `.agents/`) tightly coupled to an IDE-specific orchestration mechanism (like Antigravity IDE or Claude desktop). The execution logic, environment pre-flight checks, scaffold invocations, and agent delegation were bound to human-in-the-loop interactions with a specific AI assistant UI.

To fulfill Phase 19 of the Production Roadmap v2 (`FUT-001`, `FUT-002`), the PyrusBot orchestration core must be extracted into a programmatic, UI-neutral implementation. This decoupling allows PyrusBot to be run by any adapter—such as a Chat bot, CLI, Web UI, or automated CI/CD pipeline—without altering the infrastructure contracts with Pyrus MCP and Knowledge MCP.

## Decision

We will extract the orchestration logic from the IDE-specific prompts into a programmatic TypeScript core within the `pyrusBot` project (`src/core`).

1. **UI-Neutral Orchestration Core (`orchestrator.ts`)**: 
   A state machine and service class that explicitly defines the PyrusBot workflow:
   - Initializing a session and validating the environment (pre-flight checks).
   - Syncing with Knowledge MCP / Knowledge Base.
   - Routing requests based on intent (e.g., new form scaffolding, reverse documentation, bug fixing).
   - Delegating sub-tasks to specialized agents.
   - Finalizing the session (mirroring, pushing).

2. **Adapter Contracts (`adapters.ts`)**:
   Standardized interfaces for input/output and human-in-the-loop interactions.
   - `UserInterfaceAdapter`: Abstract interface defining how the core interacts with the user (asking questions, reporting progress, requesting approval).
   - `AgentRunnerAdapter`: Abstract interface defining how the core invokes specialist AI agents (e.g., `pyrus_spec_analyst`, `pyrus_bot_developer`).

## Consequences

- **Positive:** PyrusBot is no longer locked into a single IDE. We can build a CLI (`npm run bot`) or a web dashboard.
- **Positive:** Testing the orchestration flow can now be done programmatically with mock adapters.
- **Negative:** Maintaining the TS core alongside the existing markdown prompts may cause drift if not synchronized. The `.agents` directory will gradually become configuration data for the `AgentRunnerAdapter` rather than the sole source of truth for the workflow.
