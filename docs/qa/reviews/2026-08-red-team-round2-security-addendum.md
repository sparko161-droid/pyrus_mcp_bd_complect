# Red Team Round 2 — Security addendum

## P0-SEC-01: Credential exposed in committed test runners

Both `mcp_proof_runner.py` and `integration_runner.py` contain a hard-coded Pyrus security credential in source code. They also hard-code the target login and person ID. This must be treated as a credential exposure regardless of whether the credential is still valid.

Required response:
1. Revoke/rotate the credential immediately.
2. Remove secrets from future commits and repository working tree.
3. Purge the secret from Git history according to the organization's incident-response procedure.
4. Replace with ephemeral environment/CI secret injection.
5. Add a secret-scanning gate that fails on credential-like patterns.

## P0-SEC-02: Verification runners are not assertion-based

`mcp_proof_runner.py` and `integration_runner.py` mostly print/log success or error summaries. They do not fail the process when a tool returns an empty response, malformed payload, unexpected result, or semantic failure. A runner that records a PASS-looking line without asserting the contract cannot be a release gate.

## P0-SEC-03: Verification runners are partial, not 61-tool harnesses

The added runners exercise selected reads and lifecycle scenarios. They do not iterate through a canonical list of all 61 tools. The verification claim therefore materially exceeds what these runners prove.

## P1-SEC-04: Evidence lacks raw protocol fidelity

The committed proof artifacts should capture the exact JSON-RPC request/response pair, target server commit, environment ID, fixture ID, expected assertion, actual assertion, exit status and hash. Human-readable snippets are not enough for post-hoc replay.

## Decision

The latest verification package remains **NO-GO** and additionally requires credential rotation before further live testing.
