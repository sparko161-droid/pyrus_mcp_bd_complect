# Pyrus API v4 — MCP compliance matrix 2026-08

**Normative source:** https://pyrus.com/ru/help/api  
**Purpose:** method-by-method baseline for MCP parity.  
**Rule:** `OFFICIAL` means Pyrus API method; `PROJECT-ADDED` means an MCP convenience capability and must not be counted as parity.

> The current repository does not yet contain reliable endpoint evidence for all legacy tools. This matrix therefore treats the official Pyrus API as the primary contract and keeps legacy/source provenance as a separate field. A row is not considered complete until request schema, response fixture, errors, quirks and scope are all evidenced.

## Authorization and transport

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-A01 | Auth | `POST /auth` | partial | Implement/retest `login`, `security_key`, optional `person_id`; capture `access_token/api_url/files_url`; re-auth on expiry/revocation |
| PY-A02 | Generic transport | bearer auth / JSON / date semantics / error envelope | partial | Centralize exact protocol behavior and fixtures |
| PY-A03 | Rate-limit contract | response headers + `429 too_many_requests` | partial | Parse headers, expose reset metadata, test 5000/10min boundary |

## Forms / registries

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-F01 | List forms | `GET /forms` | implemented | verify empty-field omission, unknown-field tolerance, scopes and tenant context |
| PY-F02 | Get form | `GET /forms/{form-id}` | implemented | cache must be tenant-aware and invalidatable |
| PY-F03 | Registry | `GET /forms/{form-id}/register` | partial | support documented filters, sorting, field selection, task ids, steps, archive semantics and safe pagination |
| PY-F04 | Get form permissions | `GET /forms/{form-id}/permissions` | missing | add tool + fixture + scope |
| PY-F05 | Update form permissions | `POST /forms/{form-id}/permissions` | missing | add guarded mutation + audit + idempotency analysis |

## Tasks

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-T01 | Get task | `GET /tasks/{task-id}` | implemented | verify full response model, comments/fields/attachments, omitted fields |
| PY-T02 | Create task | `POST /tasks` | partial | model documented create schema completely; validate form fields and complex field types |
| PY-T03 | Change task | `POST /tasks/{task-id}/comments` | partial | support documented field changes, assignments, approvals, subscribers, attachments and action semantics as typed variants |
| PY-T04 | Delete task | `DELETE /tasks/{task-id}` | missing | add guarded destructive tool + audit + confirmation policy |

**Task API invariant:** changes to tasks, fields and attachments are represented through task comments/actions; MCP must preserve this contract instead of inventing a second state mutation model.

## Announcements

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-N01 | List announcements | `GET /announcements` | partial | add `item_count` and all documented query semantics |
| PY-N02 | Get announcement | `GET /announcements/{id}` | missing | add |
| PY-N03 | Create announcement | `POST /announcements` | missing as official parity | add |
| PY-N04 | Comment announcement | `POST /announcements/{id}/comments` | missing | add |

## Calendar

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-C01 | Calendar | `GET /calendar` | missing | implement filters `Due`, `DueDate`, `DueForCurrentStep`, `Reminded`, UTC range, item_count, filter mask, all-accessed-tasks semantics |

## Files

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-L01 | Download file | `GET /files/download/{file-id}` | facade-only | provide secure streaming/resource behavior; do not expose unaudited naked URL as the only contract |
| PY-L02 | Upload file | `POST /files/upload` | implemented | route through shared Pyrus client, size/type guards, response fixture, orphan-file policy |

## Catalogs / directories

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-D01 | List catalogs | `GET /catalogs` | implemented | verify max size, deleted-item semantics and response model |
| PY-D02 | Get catalog | `GET /catalogs/{catalog-id}` | implemented | add `include_deleted` admin-only semantics |
| PY-D03 | Create/sync catalog | `PUT /catalogs` | missing | add typed mutation |
| PY-D04 | Sync catalog | `POST /catalogs/{catalog-id}` | missing | add full sync semantics |
| PY-D05 | Diff catalog | `POST /catalogs/{catalog-id}/diff` | missing | add diff/update semantics and partial-failure fixtures |

## Knowledge Base

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-K01 | Get KB object | `GET /knowledgebase/{id}` | missing | add exact Markdown/structured response model |
| PY-K02 | Update KB object | `PUT /knowledgebase/{id}` | missing | add safe version-aware mutation |
| PY-K03 | Create KB object | `POST /knowledgebase` | missing | add |
| PY-K04 | Get KB structure | `GET /knowledgebase/structure` | missing | add structure retrieval |
| PY-K05 | Get KB permissions | `GET /knowledgebase/{id}/permissions` | missing | add |
| PY-K06 | Update KB permissions | `PUT /knowledgebase/{id}/permissions` | missing | add guarded mutation |
| PY-K07 | Delete KB object | `DELETE /knowledgebase/{id}` | missing | support `delete_with_children` and destructive confirmation |

## Contacts / staff / members

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-M01 | Contacts | `GET /contacts` | missing | add `include_inactive` semantics |
| PY-M02 | Members list | `GET /members` | implemented | verify full member schema |
| PY-M03 | Member detail | `GET /members/{id}` | missing | add |
| PY-M04 | Create member | `POST /members` | missing | add anti-abuse limits and validation |
| PY-M05 | Update member | `PUT /members/{id}` | missing | add |
| PY-M06 | Delete member | `DELETE /members/{id}` | missing | add destructive policy |

## Awards

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-AW01 | Set award threshold | `PUT /awards/{id}/threshold` | missing | add |
| PY-AW02 | Get award threshold | `GET /awards/{id}/threshold` | missing | add |
| PY-AW03 | Get member award counter | `GET /members/{member-id}/awards/{award-id}/counter` | missing | add |
| PY-AW04 | Increment award counter | `POST /members/{member-id}/awards/{award-id}/counter/increment` | missing | add idempotency/duplicate increment policy |
| PY-AW05 | Set award counter | `PUT /members/{member-id}/awards/{award-id}/counter?value={number}` | missing | add guarded mutation |

## Roles

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-R01 | List roles | `GET /roles` | implemented | full schema fixture |
| PY-R02 | Get role | `GET /roles/{id}` | missing | add |
| PY-R03 | Create role | `POST /roles` | missing | add |
| PY-R04 | Update role | `PUT /roles/{role-id}` | missing | add |
| PY-R05 | Delete role | `DELETE /roles/{role-id}` | missing | require typed `task_receiver_id`; destructive policy |

## Profile

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-P01 | Get profile | `GET /profile` | missing | add optional `include_inactive` semantics |

## Lists / inbox

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-I01 | List work lists | `GET /lists` | missing | add |
| PY-I02 | Get list | `GET /lists/{list-id}` | missing | add |
| PY-I03 | List tasks in list | `GET /lists/{list-id}/tasks` | missing | archive/date semantics must be encoded |
| PY-I04 | Update list | `POST /lists/{list-id}` | missing | add typed mutation |
| PY-I05 | Inbox | `GET /inbox` | missing | add |

## Event history / audit exports

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-H01 | Event history | `GET /eventhistory` | missing | implement CSV/octet-stream streaming and `after/count` max 100000 |
| PY-H02 | File access history | `GET /fileaccesshistory` | missing | same |
| PY-H03 | Task access history | `GET /taskaccesshistory` | missing | same |
| PY-H04 | Task export history | `GET /taskexporthistory` | missing | same |
| PY-H05 | Registry download history | `GET /registrydownloadhistory` | missing | same |

## Telephony

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-TH01 | Register call | `POST /integrations/call` | missing | add call event contract, duplicate/correlation policy |
| PY-TH02 | Attach call recording | `POST /integrations/attachcallrecord` | missing | add media/metadata contract |

## Webhooks / bot events

| ID | Method | Endpoint | Current status | Required action |
|---|---|---|---|---|
| PY-W01 | Pyrus bot handler | HTTPS POST callback | partial | verify `X-Pyrus-Sig`, `X-Pyrus-Retry`, 2xx within 60s, 61/122s retry behavior, tenant-specific api_url/files_url |

## Field format / serialization

| ID | Contract | Current status | Required action |
|---|---|---|---|
| PY-S01 | Simple fields | partial | complete typed coverage: text, money, number, date/time, checkmark, due date/time, email, phone, flag, step/status, creation date, note |
| PY-S02 | Composite fields | partial | complete catalog, table, title, form_link and nested table/composite shapes |
| PY-S03 | Field metadata | partial | preserve code, required, immutable/required step, nested/table column metadata |

## Global limits and error semantics

The MCP client must enforce or correctly surface documented Pyrus limits rather than let the AI discover them through avoidable 4xx/5xx errors:

- 5000 requests / 10 minutes / user;
- registry response max 20,000 tasks;
- catalog max 50,000 items and documented element length constraint;
- task comments max 10,000;
- task attachments max 3,000;
- comment attachments max 100;
- task steps max 20;
- announcement list default/max item count semantics;
- webhook callback timeout/retry behavior;
- CSV/binary history endpoints require streaming, not JSON assumptions.

## Legacy/source provenance rule

The repository currently does **not** contain sufficient evidence to make the statement "legacy MCP = exact source X" trustworthy. `pyrus-tool-catalog.yaml` is explicitly a recovered scaffold and the previous source specification is absent. Therefore each legacy tool must gain:

```yaml
source:
  kind: legacy_mcp | project_added | pyrus_official_only
  repository: <repo>
  commit: <sha>
  path: <file>
legacy_schema_hash: <sha256>
legacy_output_fixture: <fixture id>
```

Until that evidence exists, parity claims are **UNVERIFIED**.

## Acceptance definition

100% coverage means all official rows are either:

1. `IMPLEMENTED + TESTED`; or
2. `OUT_OF_SCOPE + signed ADR + explicit dashboard/task status`.

A convenience tool may coexist with the official method, but it cannot replace the official method in the coverage matrix.
