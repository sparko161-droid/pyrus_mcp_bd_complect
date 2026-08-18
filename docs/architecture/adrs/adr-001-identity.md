# ADR-001: Multi-User Identity Model
**Status:** Approved
**Date:** 2026-08-18

## Context
The FastMCP server must support multiple human users operating through AI agents simultaneously.

## Decision
We will use a **Service Account Proxy** pattern. The MCP Server holds a master Pyrus Bot/Integration token. It identifies the incoming AI agent's session/user context via standard MCP initialization parameters or client-side injected headers, and proxies requests to Pyrus on their behalf.
