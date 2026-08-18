# Pyrus AI Ecosystem (pyrus_mcp_bd_complect)

This repository contains the complete, governed ecosystem for the AI-assisted Pyrus workflows. It unites the legacy/active Telegram bot with the next-generation Model Context Protocol (MCP) server under a single Documentation-Driven Development (DDD) governance structure.

## Structure

```
pyrus_mcp_bd_complect/
├── pyrus_mcp_server/   # [NEW] The FastMCP Python server implementation (Phase 0+)
├── pyrusBot/           # [EXISTING] The Telegram bot integration
├── docs/               # Architecture, AI team roles, and QA gates for the entire ecosystem
├── tasks/              # The living registry.yaml task board and handoff packets
└── scripts/            # Infrastructure scripts (e.g., dashboard-server.mjs)
```

## Governance & Interactive Board

We use a strict AI Team governance model (`AGENTS.md`, `docs/qa/gates.md`) to prevent hallucinations and ensure code quality across both the bot and the MCP server.

To view the live task board:
```bash
node scripts/dashboard-server.mjs
# Open http://localhost:4748/
```

## Ecosystem Vision

By placing `pyrusBot` and `pyrus_mcp_server` in the same repo, we enable:
1. **Shared Pydantic Models**: The MCP server and the Telegram bot can eventually share the exact same Pyrus API data models.
2. **Unified Agent Tasking**: `registry.yaml` now tracks tasks for both the Bot's maintenance and the MCP server's implementation.
3. **Cross-pollination**: The webhook queue mechanism we build for the MCP server can be directly consumed or shared by `pyrusBot`.
