import structlog
from typing import Dict, Any, Optional
from ..db.knowledge_repository import knowledge_repo
from ..models.domain.knowledge import KnowledgeDocument

logger = structlog.get_logger("ecosystem.bot_publisher")

class BotSolutionPublisher:
    """Harvests successful task solutions and automatically creates Solution Bank drafts."""

    async def harvest_task_solution(
        self,
        task_id: int,
        title: str,
        solution_summary: str,
        author_id: str,
        slug_prefix: str = "sol"
    ) -> KnowledgeDocument:
        slug = f"{slug_prefix}-task-{task_id}"
        
        logger.info("Harvesting task resolution into Solution Bank", task_id=task_id, slug=slug)
        
        evidence = [{
            "entity_type": "pyrus_task",
            "entity_id": str(task_id),
            "relation_type": "generated_from"
        }]
        
        content = f"# Solution: {title}\n\n## 1. Problem Context\nDerived from Pyrus Task #{task_id}.\n\n## 2. Verified Resolution\n{solution_summary}\n\n## 3. Provenance\n- Source Task: Pyrus Task #{task_id}\n- Author: {author_id}\n"
        
        doc = await knowledge_repo.create_document(
            title=title,
            slug=slug,
            content=content,
            author_id=author_id,
            evidence_list=evidence
        )
        return doc

bot_solution_publisher = BotSolutionPublisher()
