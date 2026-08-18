# Production Readiness & Release Checklist

**Target Version:** `v1.0.0`
**Owner:** DevOps Lead / Release Manager

## 1. Pre-Flight Verification Checklist
- [x] Pinned Python 3.12 non-root container image (`pyrus-mcp-server:1.0.0`)
- [x] Healthcheck probes `/health` (HTTP 200) and `/ready` (HTTP 200) operational
- [x] All database migrations execute idempotently without data loss
- [x] Prometheus scrape endpoint `/metrics` functional and unauthenticated
- [x] Secrets injected strictly via environment variables (no hardcoded credentials)
- [x] JSON logging with automated redaction of tokens and keys active
- [x] Unit, integration, security fuzzing, and load test suites passing 100%
- [x] 4 Prometheus alerting rules and 3 operational runbooks deployed

## 2. Rollback Triggers & Recovery Procedure
| Condition | Action |
|:---|:---|
| Crashloop or `/health` fails > 3 retries | Revert to previous image tag; SQLite volume remains mounted. |
| 5xx error rate > 5% over 5m | Follow `docs/sre/runbooks/high-error-rate.md`. |
| Pyrus API unreachable | Follow `docs/sre/runbooks/pyrus-api-down.md`. |
| Webhook spoofing attack | Follow `docs/sre/runbooks/webhook-signature-spike.md`. |
