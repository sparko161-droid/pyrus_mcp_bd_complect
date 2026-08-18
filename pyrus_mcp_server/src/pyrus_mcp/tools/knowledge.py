import json
import structlog
from mcp.types import TextContent
from .registry import tool_registry
from ..db.knowledge_repository import knowledge_repo
from ..pyrus.client import pyrus_client
from ..models.domain.knowledge import (
    KnowledgeDocument,
    KnowledgeSearchResult,
)

logger = structlog.get_logger("tools.knowledge")

@tool_registry.register(
    name="search_knowledge",
    description="Performs hybrid semantic and full-text search across the Solution Bank & Knowledge Base.",
    inputSchema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query keywords or natural language question"},
            "limit": {"type": "integer", "description": "Max number of results to return", "default": 5}
        },
        "required": ["query"]
    }
)
async def search_knowledge(arguments: dict) -> list[TextContent]:
    query = arguments["query"]
    limit = arguments.get("limit", 5)
    
    results = await knowledge_repo.search(query=query, limit=limit)
    return [TextContent(type="text", text=json.dumps([r.model_dump() for r in results], indent=2))]


@tool_registry.register(
    name="get_knowledge_document",
    description="Retrieves a complete Knowledge Base document by ID or unique slug, including current revision and evidence links.",
    inputSchema={
        "type": "object",
        "properties": {
            "doc_id_or_slug": {"type": "string", "description": "Document UUID or unique human-readable slug"}
        },
        "required": ["doc_id_or_slug"]
    }
)
async def get_knowledge_document(arguments: dict) -> list[TextContent]:
    doc_id_or_slug = arguments["doc_id_or_slug"]
    doc = await knowledge_repo.get_document(doc_id_or_slug)
    if not doc:
        return [TextContent(type="text", text=json.dumps({"error": f"Document '{doc_id_or_slug}' not found"}))]
    return [TextContent(type="text", text=json.dumps(doc.model_dump(), indent=2))]


@tool_registry.register(
    name="create_knowledge_draft",
    description="Creates a new draft document in the Solution Bank with initial markdown content and optional evidence links to Pyrus tasks.",
    inputSchema={
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Title of the knowledge document"},
            "slug": {"type": "string", "description": "Unique URL-friendly slug (e.g. playbook-db-recovery)"},
            "content": {"type": "string", "description": "Full markdown content of the document"},
            "author_id": {"type": "string", "description": "Agent ID or user ID authoring the draft"},
            "evidence_tasks": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "Optional list of Pyrus task IDs solving or related to this document"
            }
        },
        "required": ["title", "slug", "content", "author_id"]
    }
)
async def create_knowledge_draft(arguments: dict) -> list[TextContent]:
    title = arguments["title"]
    slug = arguments["slug"]
    content = arguments["content"]
    author_id = arguments["author_id"]
    evidence_tasks = arguments.get("evidence_tasks", [])
    
    evidence_list = [{"entity_type": "pyrus_task", "entity_id": str(t_id), "relation_type": "solves"} for t_id in evidence_tasks]
    
    doc = await knowledge_repo.create_document(
        title=title, slug=slug, content=content,
        author_id=author_id, evidence_list=evidence_list
    )
    return [TextContent(type="text", text=json.dumps(doc.model_dump(), indent=2))]


@tool_registry.register(
    name="submit_knowledge_revision",
    description="Submits an updated revision for an existing knowledge document and sets its state to IN_REVIEW.",
    inputSchema={
        "type": "object",
        "properties": {
            "doc_id": {"type": "string", "description": "UUID of the document"},
            "content": {"type": "string", "description": "Updated markdown content"},
            "author_id": {"type": "string", "description": "Agent ID or user ID submitting the revision"}
        },
        "required": ["doc_id", "content", "author_id"]
    }
)
async def submit_knowledge_revision(arguments: dict) -> list[TextContent]:
    doc_id = arguments["doc_id"]
    content = arguments["content"]
    author_id = arguments["author_id"]
    
    rev = await knowledge_repo.submit_revision(doc_id, content, author_id)
    return [TextContent(type="text", text=json.dumps(rev.model_dump(), indent=2))]


@tool_registry.register(
    name="approve_knowledge_revision",
    description="Approves a knowledge document revision, setting its lifecycle state to APPROVED.",
    inputSchema={
        "type": "object",
        "properties": {
            "doc_id": {"type": "string", "description": "UUID of the document to approve"},
            "reviewer_id": {"type": "string", "description": "Approver ID"}
        },
        "required": ["doc_id", "reviewer_id"]
    }
)
async def approve_knowledge_revision(arguments: dict) -> list[TextContent]:
    doc_id = arguments["doc_id"]
    success = await knowledge_repo.update_state(doc_id, "APPROVED")
    return [TextContent(type="text", text=json.dumps({"doc_id": doc_id, "state": "APPROVED", "success": success}))]


@tool_registry.register(
    name="publish_knowledge_to_pyrus",
    description="Publishes an APPROVED knowledge document into Pyrus (creating an announcement or task artifact) and transitions state to PUBLISHED.",
    inputSchema={
        "type": "object",
        "properties": {
            "doc_id": {"type": "string", "description": "UUID of the approved document"}
        },
        "required": ["doc_id"]
    }
)
async def publish_knowledge_to_pyrus(arguments: dict) -> list[TextContent]:
    doc_id = arguments["doc_id"]
    doc = await knowledge_repo.get_document(doc_id)
    if not doc:
        return [TextContent(type="text", text=json.dumps({"error": "Document not found"}))]
        
    if doc.state not in ("APPROVED", "PUBLISHED"):
        return [TextContent(type="text", text=json.dumps({"error": f"Cannot publish document in state '{doc.state}'. Document must be APPROVED."}))]

    # Post to Pyrus Announcements or create task
    try:
        announcement_payload = {
            "text": f"📚 [Solution Bank] **{doc.title}**\n\n{doc.current_content}"
        }
        await pyrus_client.post("/announcements", json=announcement_payload)
        await knowledge_repo.update_state(doc_id, "PUBLISHED")
        return [TextContent(type="text", text=json.dumps({"doc_id": doc_id, "state": "PUBLISHED", "synced_to_pyrus": True}))]
    except Exception as e:
        logger.error("Failed to publish document to Pyrus", doc_id=doc_id, error=str(e))
        # Keep state as APPROVED on error (ADR-010 rollback semantics)
        return [TextContent(type="text", text=json.dumps({"doc_id": doc_id, "state": "APPROVED", "synced_to_pyrus": False, "error": str(e)}))]
