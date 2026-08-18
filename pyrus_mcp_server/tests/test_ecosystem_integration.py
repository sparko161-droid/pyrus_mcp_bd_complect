import pytest
from pyrus_mcp import db
from pyrus_mcp.ecosystem import bot_context_enricher, bot_solution_publisher
from pyrus_mcp.tools.knowledge import get_knowledge_document

@pytest.mark.asyncio
async def test_end_to_end_ecosystem_loop():
    # 1. Open DB & Migrations
    await db.open()
    await db.run_migrations()

    # 2. Harvest a solution from a resolved task #54321
    harvested_doc = await bot_solution_publisher.harvest_task_solution(
        task_id=54321,
        title="SSL Certificate Renewal Guide",
        solution_summary="Ran certbot certonly with Cloudflare DNS challenge.",
        author_id="devops-agent"
    )
    assert harvested_doc.slug == "sol-task-54321"
    assert harvested_doc.state == "DRAFT"
    assert len(harvested_doc.evidence) == 1
    assert harvested_doc.evidence[0].entity_id == "54321"

    # 3. Simulate incoming task requiring SSL guidance
    task_incoming = {
        "id": 99001,
        "text": "Please help with SSL Certificate Renewal"
    }
    
    enriched = await bot_context_enricher.get_enriched_context_for_task(task_incoming)
    assert enriched["has_solutions"] is True
    assert len(enriched["suggested_knowledge"]) >= 1
    assert enriched["suggested_knowledge"][0]["slug"] == "sol-task-54321"

    await db.close()
