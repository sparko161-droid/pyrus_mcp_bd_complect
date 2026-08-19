# Legacy Pyrus MCP live-connectivity audit — 2026-08

## Target

`https://pyrus-mcp-production.up.railway.app/mcp`

## Attempted live verification

On 2026-08-19 the audit runner attempted a direct HTTPS JSON-RPC `initialize` request with:

- MCP protocol version: `2025-06-18`
- JSON-RPC method: `initialize`
- client name: `audit-client`
- `Accept: application/json, text/event-stream`

The connection failed before HTTP negotiation with a DNS resolution error for `pyrus-mcp-production.up.railway.app`.

A web retrieval attempt could not establish a usable connection either. Public search did not return a current indexed page for the endpoint.

### Important conclusion

This audit **does not claim that the legacy MCP is currently online, offline, healthy, or unchanged**. The only authoritative evidence available to this execution is the captured 2026-08-18 inventory and the repository's behavioral-probing tooling.

## Captured evidence remains valid as a snapshot

- `inventory.json` — protocol/capability/tool snapshot
- `TOOLS.md` — human-readable tool schema catalogue
- `COVERAGE.md` — captured API mapping
- `collector/mcp_introspect.py` — initialize/tools/list introspection
- `collector/apiscope.py` — outbound request observation
- `collector/probe_tools.py` — controlled behavioral probing
- `collector/mock_mcp_server.py` — local MCP test server
- `collector/fake_pyrus.py` — fake upstream for deterministic probing

## Required external live verification

`LIVE-001` must be executed from a runner with external DNS/HTTPS access.

Minimum evidence required:

1. DNS resolution succeeds.
2. HTTPS/TLS succeeds.
3. `initialize` succeeds with the current supported MCP protocol.
4. Server reports protocol/version/capabilities.
5. `tools/list` succeeds.
6. Tool pagination, if present, is exhausted.
7. Session requirements, if present, are captured.
8. A safe read-only tool is called in a test account.
9. Raw sensitive values are redacted.
10. Inventory is hashed and stored with timestamp.
11. The live inventory is diffed against `inventory.json`.
12. Any drift creates a linked discovery task rather than silently overwriting the baseline.

## Safety boundary

No write operation against the foreign/legacy MCP should be attempted until the account, test data, and destructive-operation allowlist are explicitly approved by the Human Architect and Security Agent.
