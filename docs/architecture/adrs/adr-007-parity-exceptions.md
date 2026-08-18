# ADR 007: Parity Exceptions & API v4 Auth Migration

**Status:** Accepted
**Date:** 2026-08-18

## Context
During the Parity Gate (Phase 9), we compared the new MCP Server capabilities with the legacy `pyrusBot` scripts. We noticed that the legacy bot utilized a static `pyrus_api_token` for authorization against older endpoints. However, the official Pyrus v4 API requires a dynamic authorization flow using `login` and `security_key` to obtain a short-lived `access_token` and the tenant-specific routing URLs (`api_url`, `files_url`).

## Decision
We will **intentionally break backwards compatibility** with the legacy bot's authentication scheme.
1. The new MCP Server will exclusively use the v4 `POST /auth` flow.
2. The legacy `PYRUS_API_TOKEN` environment variable is formally deprecated.
3. We will require `PYRUS_LOGIN` and `PYRUS_SECURITY_KEY`.
4. File uploads will strictly route through the `files_url` provided by the `/auth` response, not a hardcoded domain.

## Consequences
- **Positive:** We are fully compliant with current Pyrus API v4 specifications, ensuring long-term stability and proper tenant routing.
- **Negative:** Existing `.env` configurations from the legacy toolkit will fail to boot the MCP server until they are updated to the new credentials format.
- **Mitigation:** `.env.example` has been updated, and the `PyrusAuthenticator` class strictly enforces this format.
