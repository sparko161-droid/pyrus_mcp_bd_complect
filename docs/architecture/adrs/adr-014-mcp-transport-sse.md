# ADR 014: MCP Transport Protocol

## Status
Accepted

## Context
The Model Context Protocol (MCP) defines multiple transport mechanisms, primarily Stdio (for local execution) and Server-Sent Events (SSE) (for remote HTTP-based execution). 
We need to determine the primary transport protocol for the Pyrus and Knowledge MCP servers to communicate with authorized AI hosts (e.g. Google Antigravity).

While Streamable HTTP or gRPC are common for internal microservices, we must conform strictly to the MCP specification for external interoperability.

## Decision
We will use **SSE (Server-Sent Events) over HTTP** as the standard transport for all remote MCP servers in this repository (pyrus-mcp-server, knowledge-mcp-server, iiko-mcp-server).

The FastMCP library will be configured with SSE transport by default when deployed in production.

## Consequences
- **Positive:** Full compliance with the official MCP specification.
- **Positive:** Wide compatibility with existing MCP clients out-of-the-box.
- **Positive:** Unidirectional streaming (Server -> Client) maps cleanly to asynchronous tool execution and logging.
- **Negative:** Requires stateful connection management on the load balancer (no premature connection termination).
- **Negative:** Clients must POST commands to a separate endpoint (since SSE is unidirectional), requiring correlation IDs for responses. (Handled internally by MCP SDKs).
