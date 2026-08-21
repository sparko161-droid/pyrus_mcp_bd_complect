# Red Team Round 2 — MCP 61-tool verification audit

**Target commit:** `a4438ce67638158f735cc4770046e1d9de919f3c`
**Claim under review:** `feat(mcp): complete verification and fixes for all 61 tools, add QA reports and proof logs`
**Audit date:** 2026-08-20
**Decision:** **NO-GO / VERIFICATION REJECTED**

## Executive finding

The new commit contains meaningful code changes, but the submitted verification package does not prove the claim that all 61 tools were fully verified. Multiple self-contradictions exist between the new runtime, its tests, inventory scripts, and the evidence report.

## P0 findings

### RT2-001 — New server removes `/health` and `/ready` while CI smoke test still requires `/health`

`pyrus_mcp_server/src/pyrus_mcp/server.py` now mounts `StreamableHTTPSessionManager.handle_request` at `/` and defines no `/health` or `/ready` route. `tests/test_production_smoke.py` still calls `client.get("/health")` and expects HTTP 200/version `1.0.0`. CI executes `pytest tests/`. Therefore the repository contains an explicit runtime/test contract contradiction.

**Evidence:** `pyrus_mcp_server/src/pyrus_mcp/server.py`, `pyrus_mcp_server/tests/test_production_smoke.py`, `.github/workflows/ci.yml`.

### RT2-002 — Stateful/stateless claim is not implemented as claimed

The new server constructs `StreamableHTTPSessionManager(..., stateless=True)` unconditionally. There is no configuration branch or stateful mode. The commit description therefore overstates the transport capability.

### RT2-003 — `check_tools.py` is not a complete 61-tool inventory checker

The script imports only the early tool modules (`members`, `catalogs`, `forms`, `tasks`, `misc`, `pyrus_kb`). The production registration module imports the additional legacy modules (`legacy_misc`, `legacy_catalogs`, `legacy_lists`, `legacy_contacts_roles`, `legacy_announcements`, `legacy_calendar_tasks`, `legacy_task_aliases`). The checker can therefore undercount or otherwise diverge from the actual server registration surface.

### RT2-004 — Proof log is an assertion log, not reproducible evidence

`docs/qa/mcp_proof_log.jsonl` records only `tool`, `status`, and `result_summary`. It lacks execution timestamp, target commit, transport envelope, request payload, raw response/error, HTTP status, fixture ID, and artifact/hash references. A reviewer cannot independently reproduce any individual PASS from this file.

### RT2-005/006 — No executable 61-tool oracle is present

The report enumerates 61 PASS rows, but no repository evidence currently demonstrates a deterministic harness that compares `tools/list` against a canonical 61-tool manifest and then invokes each tool with recorded fixtures. The report is therefore not sufficient to certify all 61 paths.

## P1 findings

### RT2-007 — Production smoke suite is stale relative to the new transport

The smoke suite targets the previous `/health` contract and checks only a legacy core-tool subset (`len(tools) >= 15`) rather than the claimed 61-tool surface.

### RT2-008 — CORS configuration is overly broad

`server.py` enables `allow_origins=["*"]` together with `allow_credentials=True`. This needs an explicit browser/security decision and regression coverage rather than being silently accepted as production-safe.

### RT2-009 — Middleware silently rewrites malformed client envelopes

`AcceptHeaderMiddleware` changes missing/wildcard `Accept` and invalid `Content-Type` headers to accepted values instead of returning explicit protocol errors. This can mask client defects and make protocol conformance tests less meaningful.

### RT2-010 — Compose mounts source code into the container

`pyrus_mcp_server/docker-compose.yml` bind-mounts `./src:/app/src`. This undermines immutable-image deployment and can cause runtime code to diverge from the image that was verified.

### RT2-011 — Claimed individual fixes require contract-level verification

The report says `create_task`, list creation, role deletion and auth-context fixes are proven. Those claims must be re-run from the exact commit using negative cases and request/response evidence, not inferred from a prose summary.

### RT2-012 — Test-created Pyrus objects need mandatory cleanup evidence

The proof log contains created members, roles, lists, announcements, tasks, catalogs and KB objects. The verification package does not expose a deterministic cleanup record for every created resource. This can pollute the target tenant and invalidate repeatability.

### RT2-013 — Exact commit CI evidence is absent from the submitted proof

The repository's `main` branch currently has protection disabled and no required status checks. The commit is unsigned. A release-style verification claim should not rely on manual prose when the CI result is not attached as immutable evidence.

### RT2-014 — Main branch protection is absent

The `main` branch is not protected and required status checks are off. That makes it possible to land another release-style claim without mandatory automated verification.

## Evidence quality conclusion

The new verification report is useful as a human-readable test journal, but it is not sufficient as release evidence. At minimum each PASS must be linked to an executable test case, the exact server commit, transport-level request/response evidence, and immutable artifact hash.

## Release decision

**NO-GO.** The 61-tool verification claim is reopened.

No phase/release should be marked complete until RT2-001 through RT2-006 are resolved and the 61-tool harness is able to fail mechanically on schema drift, missing registration, stale tests, protocol errors, and fabricated PASS records.
