import structlog
from typing import Dict, Any, Optional
from ..db.knowledge_repository import knowledge_repo

logger = structlog.get_logger("ecosystem.bot_context")

class BotContextEnricher:
    """Enriches incoming task events with relevant Solution Bank knowledge and provenance."""

    async def get_enriched_context_for_task(self, task_data: Dict[str, Any], query_override: Optional[str] = None) -> Dict[str, Any]:
        task_id = task_data.get("id")
        task_text = query_override or task_data.get("text", "")
        
        logger.info("Enriching task context from Solution Bank", task_id=task_id)
        
        # Search relevant knowledge documents
        results = await knowledge_repo.search(query=task_text, limit=3)
        
        provenance = []
        for r in results:
            doc = await knowledge_repo.get_document(r.doc_id)
            provenance.append({
                "doc_id": r.doc_id,
                "slug": r.slug,
                "title": r.title,
                "state": r.state,
                "snippet": r.snippet,
                "evidence_count": len(doc.evidence) if doc else 0,
            })
            
        return {
            "task_id": task_id,
            "query": task_text,
            "suggested_knowledge": provenance,
            "has_solutions": len(provenance) > 0,
        }

bot_context_enricher = BotContextEnricher()
