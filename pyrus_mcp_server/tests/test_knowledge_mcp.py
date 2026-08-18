import json
import pytest
from unittest.mock import patch, AsyncMock
from pyrus_mcp.db.knowledge_repository import knowledge_repo
from pyrus_mcp.tools.knowledge import (
    create_knowledge_draft,
    get_knowledge_document,
    submit_knowledge_revision,
    approve_knowledge_revision,
    search_knowledge,
    publish_knowledge_to_pyrus,
)
from pyrus_mcp import db

@pytest.mark.asyncio
async def test_knowledge_document_lifecycle():
    # 1. Open DB & Migrations
    await db.open()
    await db.run_migrations()

    # 2. Create Draft Document
    draft_res = await create_knowledge_draft({
        "title": "Incident Playbook: Database Failover",
        "slug": "playbook-db-failover-test",
        "content": "# Database Failover Playbook\n\n## 1. Detection\nCheck Prometheus alert.\n\n## 2. Recovery\nPromote replica.",
        "author_id": "architect-agent",
        "evidence_tasks": [1001, 1002]
    })
    draft_data = json.loads(draft_res[0].text)
    assert draft_data["title"] == "Incident Playbook: Database Failover"
    assert draft_data["state"] == "DRAFT"
    doc_id = draft_data["id"]

    # 3. Search Knowledge
    search_res = await search_knowledge({"query": "Promote replica"})
    search_data = json.loads(search_res[0].text)
    assert len(search_data) >= 1
    assert search_data[0]["doc_id"] == doc_id

    # 4. Submit Revision
    rev_res = await submit_knowledge_revision({
        "doc_id": doc_id,
        "content": "# Database Failover Playbook v2\n\nUpdated with automated promotion script.",
        "author_id": "sre-agent"
    })
    rev_data = json.loads(rev_res[0].text)
    assert rev_data["revision_num"] == 2

    # Verify state transitioned to IN_REVIEW
    doc = await knowledge_repo.get_document(doc_id)
    assert doc.state == "IN_REVIEW"

    # 5. Approve Document
    appr_res = await approve_knowledge_revision({"doc_id": doc_id, "reviewer_id": "chief-architect"})
    appr_data = json.loads(appr_res[0].text)
    assert appr_data["state"] == "APPROVED"

    # 6. Publish to Pyrus (Mocking PyrusClient)
    with patch("pyrus_mcp.tools.knowledge.pyrus_client.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = {"announcement_id": 777}
        pub_res = await publish_knowledge_to_pyrus({"doc_id": doc_id})
        pub_data = json.loads(pub_res[0].text)
        assert pub_data["state"] == "PUBLISHED"
        assert pub_data["synced_to_pyrus"] is True
        mock_post.assert_called_once()

    await db.close()
