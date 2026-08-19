# iiko MCP v1 — карта реализации и API coverage

**Статус:** architecture baseline / implementation plan  
**Источники:**
- https://public-api.iikoweb.ru/documentation
- https://api-ru.iiko.services/docs
- https://ru.iiko.help/articles/#!api-documentations/iikoserver-api

## 1. Архитектурная цель

Третий MCP должен предоставлять AI-агенту единый typed tool surface для iiko, не протаскивая в промпт внутренние имена HTTP endpoint'ов.

```text
AI Agent
   |
   v
MCP / iiko tool contract
   |
   +-- authorization / tenant / scope
   +-- validation / idempotency / safety policy
   +-- application services
   +-- iiko Cloud adapter
   +-- iikoServer adapter
   |
   +-- audit / telemetry / cache
   +-- official API snapshots + fixtures
```

Pyrus MCP platform components (MCP transport, identity, shared HTTP patterns, observability) may be reused as platform libraries, but iiko domain logic and provider contracts must stay isolated.

## 2. Two provider contours — do not merge them

### iiko Cloud API

- Internet HTTPS API.
- Account/application scoped credentials.
- Versioned public endpoints, currently centered on `/api/1` and `/api/2` surfaces.
- Access tokens have a finite lifetime; the authentication scheme must be verified from the current official portal before code freeze because current public secondary sources already show a transition to application credentials.

### iikoServer / on-prem

- Local/customer-controlled network topology.
- API availability depends on installed iikoServer/version/configuration.
- Requires separate endpoint discovery, connection health, TLS/network policy, timeout and version capability negotiation.
- Never assume a Cloud endpoint is valid for on-prem.
- The adapter must report provider mode and supported capability set to the MCP service.

## 3. Mandatory discovery gate

The official iiko API portals are dynamically rendered. Before claiming complete parity, the team must capture an official machine-readable snapshot from the current portal (OpenAPI/Swagger/endpoint export if available) and store:

```yaml
source_url
retrieved_at
portal_version
api_revision
sha256
raw_snapshot_path
```

The snapshot becomes the versioned contract source. Maintained SDKs are secondary evidence only.

## 4. Authentication flow

Implementation target:

```text
configure tenant/account credentials
        |
        v
request access token
        |
        v
cache token + expiry metadata
        |
        +--> refresh before expiry
        +--> invalidate on auth failure
        +--> never log credentials/token
```

Credentials must be represented separately from MCP user identity. MCP scope checks decide what the agent may do; iiko application credentials decide which iiko account/org it may access.

The current 2026 ecosystem is transitioning authentication toward application credentials (`appId`/`clientSecret` in addition to account login/API credentials in the current public SDK ecosystem). Do not hardcode one historical flow until the official portal snapshot is captured.

## 5. Core request principles

All iiko calls go through one adapter/client:

- tenant/account routing;
- token acquisition/refresh;
- timeout budget;
- retry classifier;
- idempotency policy per operation;
- rate/concurrency limit;
- response-size limit;
- structured provider error;
- correlation id;
- audit event for writes;
- raw request/response fixture capture in test environments only.

GET-like retrieval methods should be cacheable only where freshness semantics are explicit. Mutation methods must never be auto-retried unless the operation is proven idempotent.

## 6. API inventory to reconcile against official snapshot

The inventory below is the implementation work map. Every row must be checked against the official 2026 snapshot; endpoint names are not considered normative until that gate passes.

### Auth / organizations / reference data

- `access_token` — authenticate client/application.
- `organizations` — list accessible organizations.
- `cancel_causes` — cancellation reason dictionary.
- `discounts` — discount/reference information.
- `payment_types` — payment reference data.
- `removal_types` — removal/refund/void reference data.
- `marketing_sources` — marketing source reference data.
- `tips_types` — gratuity/tip type reference data.
- `delivery_restrictions` — retrieve restrictions.
- `delivery_restrictions/update` — update restrictions.
- `delivery_restrictions/allowed` — determine allowed state/operation.
- `cities` — delivery city directory.
- `streets/by_city` — street lookup by city.

### Nomenclature / menu / availability

- `nomenclature` — complete product/nomenclature snapshot.
- `menu` — menu representation (current API family includes `/api/2/menu`).
- `menu/by_id` — retrieve menu by id where supported.
- `stop_lists` — stop-list / availability state.
- `combo/get_combos_info` — combo definitions/info.
- `combo/calculate_combo_price` — calculate combo price.

### Terminals / employees / health

- `terminal_groups` — terminal groups.
- `terminal_groups/is_alive` — terminal health/liveness.
- `employees/couriers` — courier list.
- `employees/couriers/by_role` — couriers by role.
- `employees/couriers/locations/by_time_offset` — historical courier locations.
- `employees/couriers/active_location` — current courier location.
- `employees/couriers/active_location/by_terminal` — current terminal-scoped courier location.

### Orders

- `order/create` — create order.
- `order/by_id` — get order.
- `order/by_table` — get orders/table state.
- `order/add_items` — append items.
- `order/close` — close order.
- `order/change_payments` — change payment set.
- `commands/status` — track asynchronous command status where applicable.

### Delivery orders

- `deliveries/create` — create delivery.
- `deliveries/by_id` — get delivery by IDs.
- `deliveries/by_delivery_date_and_status` — date/status retrieval.
- `deliveries/by_revision` — incremental retrieval by revision.
- `deliveries/by_delivery_date_and_phone` — historical retrieval by date/phone.
- `deliveries/by_delivery_date_and_source_key_and_filter` — source/filter retrieval.
- `deliveries/drafts/by_id` — get draft.
- `deliveries/drafts/by_filter` — find drafts.
- `deliveries/drafts/save` — save draft.
- `deliveries/drafts/commit` — commit draft.
- `deliveries/update_order_problem` — update delivery problem.
- `deliveries/update_order_delivery_status` — change delivery status.
- `deliveries/update_order_courier` — assign/change courier.
- `deliveries/add_items` — add delivery items.
- `deliveries/close` — close delivery.
- `deliveries/cancel` — cancel delivery.
- `deliveries/change_complete_before` — change target completion time.
- `deliveries/change_delivery_point` — change destination.
- `deliveries/change_service_type` — change service type.
- `deliveries/change_payments` — change payments.
- `deliveries/change_comment` — change comment.
- `deliveries/print_delivery_bill` — generate/print delivery bill representation.
- `deliveries/order_types` — delivery order types.

### Reservations

- `reserve/available_organizations` — organizations usable for reservations.
- `reserve/available_terminal_groups` — available terminal groups.
- `reserve/available_restaurant_sections` — available sections.
- `reserve/restaurant_sections_workload` — section workload.
- `reserve/create` — create reservation.
- `reserve/status_by_id` — reservation status.

### Loyalty / guests

- `loyalty/iiko/get_customer` — locate customer.
- `loyalty/iiko/customer/info` — detailed customer data.
- `loyalty/iiko/customer/card/add` — attach/create customer card.
- `loyalty/iiko/calculate_checkin` — loyalty calculation.
- `loyalty/iiko/get_manual_conditions` — manual conditions.
- `iiko/program` — programs catalogue/info where exposed by current API generation.

### Notifications

- `notifications/send` — send notification/event to configured channel.

### Webhooks

- `webhooks/settings` — read webhook settings.
- `webhooks/update_settings` — update webhook settings.

## 7. Proposed MCP tool groups

The MCP façade should expose stable semantic tools, for example:

### Read tools

- `iiko_list_organizations`
- `iiko_get_nomenclature`
- `iiko_get_menu`
- `iiko_get_stop_lists`
- `iiko_list_terminal_groups`
- `iiko_check_terminal_health`
- `iiko_list_employees`
- `iiko_find_customer`
- `iiko_get_customer`
- `iiko_get_order`
- `iiko_search_orders`
- `iiko_get_delivery`
- `iiko_search_deliveries`
- `iiko_get_reservation`
- `iiko_search_reservations`
- `iiko_get_reference_data`
- `iiko_get_webhook_settings`

### Write tools

- `iiko_create_order`
- `iiko_add_order_items`
- `iiko_close_order`
- `iiko_change_order_payments`
- `iiko_create_delivery`
- `iiko_update_delivery_status`
- `iiko_assign_delivery_courier`
- `iiko_add_delivery_items`
- `iiko_change_delivery_point`
- `iiko_change_delivery_payments`
- `iiko_cancel_delivery`
- `iiko_create_reservation`
- `iiko_add_customer_card`
- `iiko_send_notification`
- `iiko_update_webhook_settings`

Each tool must expose source endpoint metadata internally, but the AI-facing schema should be domain-oriented and typed.

## 8. MCP safety policy

Classify tools:

- `READ` — no external mutation.
- `WRITE_REVERSIBLE` — mutation with reversible/compensatable semantics.
- `WRITE_IRREVERSIBLE` — cancel/close/payment-changing actions; require explicit confirmation in higher-risk contexts.
- `ADMIN` — configuration/webhook/security changes.

Every tool gets:

```yaml
scope
provider_mode
source_endpoint
request_schema_version
write_effect
idempotency_policy
retry_policy
confirmation_policy
audit_event
fixture_set
```

## 9. Pagination and large-result strategy

Do not return unbounded nomenclature, orders or deliveries into the LLM context.

The adapter must support:

- provider-native pagination/filtering;
- bounded page size;
- continuation cursor/token when provider supports it;
- deterministic sorting for repeatability;
- result summarization;
- `next_page` token exposed to MCP client when applicable.

For large snapshots, add dedicated sync jobs and a query layer instead of forcing the agent to fetch the entire dataset repeatedly.

## 10. Data retrieval examples

### Example: retrieve organization list

```json
{
  "tool": "iiko_list_organizations",
  "arguments": {}
}
```

Expected internal flow:

```text
MCP auth -> tenant binding -> iiko token -> GET organizations -> validate -> normalize -> return bounded list
```

### Example: retrieve menu

```json
{
  "tool": "iiko_get_menu",
  "arguments": {
    "organization_id": "<uuid>",
    "include_stopped": false
  }
}
```

The implementation should retain the provider response hash and fetched-at timestamp for evidence/cache metadata.

### Example: get order

```json
{
  "tool": "iiko_get_order",
  "arguments": {
    "organization_id": "<uuid>",
    "order_id": "<uuid>"
  }
}
```

The returned model should normalize identity, timestamps, items, payments, discounts, status and source identifiers while retaining provider fields in an explicit extension map where necessary.

### Example: mutation

```json
{
  "tool": "iiko_close_order",
  "arguments": {
    "organization_id": "<uuid>",
    "order_id": "<uuid>",
    "confirmation": true,
    "idempotency_key": "<client-generated-key>"
  }
}
```

No generic retry is allowed for a close/payment/cancel mutation until the operation's idempotency semantics are proven.

## 11. Webhook/event architecture

For provider events:

```text
iiko -> webhook gateway
       -> verify authenticity
       -> persist idempotency key
       -> enqueue
       -> acknowledge immediately
       -> process asynchronously
       -> update projection/cache/knowledge evidence
```

The same event can feed the Knowledge MCP evidence pipeline, but provider events must never become canonical knowledge without normalization and provenance.

## 12. Error taxonomy

Normalize at least:

- authentication expired/invalid;
- authorization/account forbidden;
- tenant/organization not found;
- provider validation error;
- conflict/state transition invalid;
- rate limited;
- transient provider unavailable;
- timeout;
- response schema mismatch;
- local adapter/network error.

The AI-facing error must tell the agent whether retry, correction, confirmation or escalation is appropriate.

## 13. Versioning and drift control

The following are versioned independently:

- MCP tool schema version;
- iiko provider API version;
- provider response fixture version;
- normalization model version;
- capability matrix version;
- official documentation snapshot hash.

A provider schema diff must generate a compatibility task automatically.

## 14. Test architecture

### Contract tests

Official snapshot -> generated schema expectations -> adapter validation.

### Fixture tests

Captured safe responses for each method and edge case.

### Integration tests

Real iiko sandbox/test account where available.

### Safety tests

Cross-tenant, wrong organization, expired token, malformed IDs, replayed mutation, duplicate webhook and privilege escalation.

### Performance tests

Concurrent reads, burst rate limit, large nomenclature/menu, large order history and webhook burst.

## 15. Implementation phases

| Phase | Outcome |
|---|---|
| I0 | Official API snapshot, source map, auth verification, Cloud vs Server boundary |
| I1 | Shared MCP platform adapter, tenant/auth/scope/audit contracts |
| I2 | iiko client, retries, limits, errors, fixtures |
| I3 | Reference/read domains: orgs, nomenclature, menu, stoplists, terminals, employees |
| I4 | Orders and deliveries read models + bounded search |
| I5 | Reservation, loyalty, customer and reference domains |
| I6 | Write operations with safety/idempotency gates |
| I7 | Webhooks/events and sync projections |
| I8 | Contract/acceptance/load/security suite |
| I9 | Staging + release/rollback |
| I10 | Knowledge MCP evidence integration and agent benchmark |

## 16. Done criteria

The iiko MCP is not done when every endpoint has a Python function. It is done when:

- official 2026 snapshot is mapped 100%;
- every mapped endpoint has schema + fixture + error cases;
- Cloud and Server capabilities are explicitly separated;
- every MCP tool has scope, write effect, retry/idempotency policy;
- all writes pass safety gates;
- webhooks are durable/idempotent;
- observability and rollback are proven;
- agent benchmark demonstrates useful bounded context rather than raw API dumping.

## 17. Secondary evidence used during planning

Current maintained iiko SDK/MCP ecosystems were used only as discovery aids for method inventory and authentication transition signals. They must be reconciled against the official API portals before any endpoint is marked authoritative.
