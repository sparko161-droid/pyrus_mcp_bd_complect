# Pyrus API Limits, Pagination, and Webhooks

This document captures the findings for tasks **MCP-007** and **MCP-008** regarding Pyrus API constraints and webhook behaviors.

## API Rate Limits
- **Global Limit:** 5,000 requests per 10 minutes per user.
- **Extensions Limit:** Also 5,000 requests per 10 minutes.
- **Exceeding Limits:** Returns HTTP `429 Too Many Requests`.
- **Headers:** 
  - `X-RateLimit-Limit` (Max allowed)
  - `X-RateLimit-Remaining` (Available limit)
  - `X-RateLimit-Reset` (Seconds until interval resets)

## Pagination and Limits
- **Max Items:** A maximum of **20,000 tasks** can be returned in a single request. 
- **Filtering:** Pyrus encourages using specific date filters and query constraints inside the request body rather than relying strictly on standard offset/limit pagination.

## Error Handling & Undocumented Behaviors
- **Structure:** Always check the `error_code` property (e.g., `invalid_credentials`, `revoked_token`) rather than `error` text, as text is subject to change.
- **Soft Limits:** Complex queries (heavy filtering) can result in silent timeouts or internal `server_error` codes. The MCP server should implement **exponential backoff** to handle such transient failures gracefully.

## Webhooks
- **Timeout:** The receiving service must respond with a `2XX` status code within **60 seconds**.
- **Processing:** Asynchronous processing is required. Acknowledge the webhook immediately and offload the actual business logic to a background worker to avoid timeouts.
- **Idempotency:** Webhooks may be retried on network failure. The MCP server must ensure idempotency when handling incoming webhook payloads.
- **Subscriptions:** No explicitly documented numerical limit on subscriptions, but performance dictates maintaining a lean webhook map.
