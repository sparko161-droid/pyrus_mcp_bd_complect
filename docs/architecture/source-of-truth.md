# Single Source-of-Truth Hierarchy

This document defines the single source-of-truth hierarchy for the Pyrus MCP ecosystem as required by ARCH-C01.

## Hierarchy

1. **Official Pyrus and iiko API Documentation**: The absolute truth for capabilities, endpoints, and behaviors.
2. **Legacy Snapshots / API Contract Audits**: Snapshots capturing actual behaviors (quirks, undocumented pagination) acting as parity targets when the documentation is missing.
3. **Executable Code (Pyrus MCP, Knowledge MCP, iiko MCP)**: The implementations matching the documentation and snapshots.
4. **Generated Dashboard & Task Backlogs (`tasks/registry.yaml`, `tasks/2026-08-audit-overlay.yaml`)**: An honest execution view reflecting the current implementation status. The overlay corrects historical false greens without rewriting history.

## Policy

- Do not guess undocumented behavior; always capture an official snapshot or test evidence.
- If code diverges from official docs for a valid reason, it must be documented in an ADR.
- The dashboard is a projection of the YAML files and does not contain authoritative state itself.
