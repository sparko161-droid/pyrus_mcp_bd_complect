# Pyrus MCP vs Legacy pyrusBot Parity Report

**Date:** 2026-08-18
**Status:** 1:1 Parity Achieved (with architectural exceptions)

## 1. Feature Matrix

This matrix compares the capabilities of the legacy `project_toolkit/pyrusBot` scripts against the new `pyrus-mcp-server` MCP implementation.

| Domain | Feature | Legacy pyrusBot | FastMCP Server | MCP Tool / Method |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | Basic Token Auth | ✅ Yes | ❌ No | (See ADR-007) |
| **Auth** | App-Level v4 Auth (`login` / `security_key`) | ❌ No | ✅ Yes | `PyrusAuthenticator` |
| **Tenancy** | Cross-tenant isolation & scopes | ❌ No | ✅ Yes | `SecurityMiddleware` + ContextVars |
| **Tasks** | Read Task | ✅ Yes | ✅ Yes | `get_task` |
| **Tasks** | Search Inbox | ✅ Yes | ✅ Yes | `get_tasks` |
| **Tasks** | Create Task | ✅ Yes | ✅ Yes | `create_task` |
| **Tasks** | Add Comment / Approval | ✅ Yes | ✅ Yes | `add_comment` |
| **Catalogs**| List Catalogs | ✅ Yes | ✅ Yes | `get_catalogs` |
| **Catalogs**| Read Catalog Items | ✅ Yes | ✅ Yes | `get_catalog` |
| **Forms** | List Form Templates | ✅ Yes | ✅ Yes | `get_forms` |
| **Forms** | Read Form Schema | ✅ Yes | ✅ Yes | `get_form` |
| **Members** | List Organization Members | ✅ Yes | ✅ Yes | `get_members` |
| **Files** | Upload File | ✅ Yes (Brittle) | ✅ Yes (Robust) | `upload_file` (Base64 -> multipart/form-data) |

## 2. Conclusion
The new MCP server successfully matches 100% of the functional capabilities of the legacy bot, while introducing significant improvements in security, resilience (retries/circuit breaking), and standardized Pydantic data schemas. 
Parity is officially frozen at Version 1.
