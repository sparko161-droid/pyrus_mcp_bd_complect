# Pyrus Enterprise MCP Server — User & Administrator Guide

---

## 1. Quick Start

### 1.1 Running with Docker Compose (Recommended)
1. Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```
2. Set your credentials in `.env`:
   ```ini
   PYRUS_LOGIN=your_bot_email@domain.com
   PYRUS_SECURITY_KEY=your_pyrus_security_key
   PYRUS_WEBHOOK_SECRET=your_webhook_secret_here
   ```
3. Start the production stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
4. Verify server health:
   ```bash
   curl http://localhost:8000/health
   # Response: {"status":"up","version":"1.0.0","correlation_id":null}
   ```

---

## 2. Comprehensive Tool Catalog (21 Tools)

### 2.1 Task Operations
- `get_task(task_id: int)`: Fetch full task details, field values, and chronological comments.
- `get_registry(form_id: int, item_count: int = 50)`: Retrieve tasks associated with a specific form template.
- `create_task(text: str, form_id: Optional[int], fields: Optional[list])`: Create a new basic task or form-based request.
- `add_comment(task_id: int, text: str, approval_choice: Optional[str])`: Post a comment, approve (`approved`), reject (`rejected`), or update fields.
- `batch_update_tasks(task_ids: list[int], fields: list[dict], comment_text: str)`: Update multiple tasks simultaneously with partial-failure tracking.
- `batch_close_tasks(task_ids: list[int], comment_text: str)`: Close multiple tasks in a single operation.

### 2.2 Form & Catalog Discovery
- `get_forms()`: List all accessible form templates in the organization.
- `get_form(form_id: int)`: Get detailed field schema and step definitions for a form (cached for 1h).
- `get_catalogs()`: List all available catalogs and dictionaries.
- `get_catalog(catalog_id: int)`: Retrieve all items and header columns for a specific catalog.

### 2.3 Organizational Context & Files
- `get_members()`: List all organization employees and bot accounts.
- `get_roles()`: List configured business roles.
- `upload_file(filename: str, content_base64: str)`: Upload binary file and obtain a GUID for attachment.
- `download_file(file_id: int)`: Get direct download link for a file.
- `get_announcements()`: Retrieve organization announcements.

### 2.4 Solution Bank & Knowledge Base
- `search_knowledge(query: str, limit: int = 5)`: Search knowledge playbooks and solution patterns.
- `get_knowledge_document(doc_id_or_slug: str)`: Fetch a knowledge document with markdown body, revision history, and linked task evidence.
- `create_knowledge_draft(title: str, slug: str, content: str, author_id: str, evidence_tasks: list[int])`: Create a draft solution document.
- `submit_knowledge_revision(doc_id: str, content: str, author_id: str)`: Submit updated content for review.
- `approve_knowledge_revision(doc_id: str, reviewer_id: str)`: Approve a knowledge document.
- `publish_knowledge_to_pyrus(doc_id: str)`: Push approved knowledge into Pyrus announcement channels.

---

## 3. Operational Endpoints
- `/health`: Liveness probe.
- `/ready`: Readiness probe.
- `/metrics`: Prometheus metrics scraper.
- `/webhook`: Ingress for real-time Pyrus task events (requires `X-Pyrus-Sig`).
