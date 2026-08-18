import hashlib
import uuid
import structlog
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from .connection import get_connection
from ..models.domain.knowledge import (
    KnowledgeDocument,
    KnowledgeRevision,
    KnowledgeChunk,
    KnowledgeEvidence,
    KnowledgeSearchResult,
)

logger = structlog.get_logger("db.knowledge_repository")

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _hash_content(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

class KnowledgeRepository:
    """Async SQLite persistence repository for Knowledge Base & Solution Bank."""

    async def create_document(
        self,
        title: str,
        slug: str,
        content: str,
        author_id: str,
        tenant_id: str = "default",
        evidence_list: Optional[List[Dict[str, str]]] = None,
    ) -> KnowledgeDocument:
        conn = await get_connection()
        doc_id = str(uuid.uuid4())
        rev_id = str(uuid.uuid4())
        now = _utc_now()
        content_hash = _hash_content(content)

        # 1. Insert Document
        await conn.execute(
            "INSERT INTO knowledge_documents (id, slug, title, tenant_id, state, current_revision_id, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?)",
            (doc_id, slug, title, tenant_id, rev_id, now, now),
        )

        # 2. Insert Initial Revision
        await conn.execute(
            "INSERT INTO knowledge_revisions (id, doc_id, revision_num, content, content_hash, author_id, parent_revision_id, created_at) "
            "VALUES (?, ?, 1, ?, ?, ?, NULL, ?)",
            (rev_id, doc_id, content, content_hash, author_id, now),
        )

        # 3. Simple Header-Aware Chunking (ADR-009)
        lines = content.splitlines()
        chunks = []
        current_chunk = []
        current_header = None
        chunk_idx = 0

        for line in lines:
            if line.startswith("#"):
                if current_chunk:
                    chunk_text = "\n".join(current_chunk).strip()
                    if chunk_text:
                        chunks.append((chunk_idx, current_header, chunk_text))
                        chunk_idx += 1
                    current_chunk = []
                current_header = line.strip("# ").strip()
            current_chunk.append(line)

        if current_chunk:
            chunk_text = "\n".join(current_chunk).strip()
            if chunk_text:
                chunks.append((chunk_idx, current_header, chunk_text))

        for c_idx, h_path, c_text in chunks:
            c_id = str(uuid.uuid4())
            await conn.execute(
                "INSERT INTO knowledge_chunks (id, doc_id, revision_id, chunk_index, header_path, content, token_count, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (c_id, doc_id, rev_id, c_idx, h_path, c_text, len(c_text.split()), now),
            )

        # 4. Insert Evidence links if provided
        evidences = []
        if evidence_list:
            for ev in evidence_list:
                ev_id = str(uuid.uuid4())
                await conn.execute(
                    "INSERT INTO knowledge_evidence (id, doc_id, entity_type, entity_id, relation_type, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (ev_id, doc_id, ev.get("entity_type", "pyrus_task"), ev.get("entity_id", ""), ev.get("relation_type", "relates_to"), now),
                )
                evidences.append(KnowledgeEvidence(
                    id=ev_id, doc_id=doc_id, entity_type=ev.get("entity_type", "pyrus_task"),
                    entity_id=ev.get("entity_id", ""), relation_type=ev.get("relation_type", "relates_to"),
                    created_at=now
                ))

        await conn.commit()
        logger.info("Knowledge document draft created", doc_id=doc_id, slug=slug, title=title)

        return KnowledgeDocument(
            id=doc_id, slug=slug, title=title, tenant_id=tenant_id,
            state="DRAFT", current_revision_id=rev_id, created_at=now, updated_at=now,
            current_content=content, evidence=evidences
        )

    async def get_document(self, doc_id_or_slug: str) -> Optional[KnowledgeDocument]:
        conn = await get_connection()
        async with conn.execute(
            "SELECT * FROM knowledge_documents WHERE id = ? OR slug = ?",
            (doc_id_or_slug, doc_id_or_slug),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None

            doc_id = row["id"]
            rev_id = row["current_revision_id"]

        # Fetch current revision content
        content = ""
        if rev_id:
            async with conn.execute("SELECT content FROM knowledge_revisions WHERE id = ?", (rev_id,)) as r_cur:
                r_row = await r_cur.fetchone()
                if r_row:
                    content = r_row["content"]

        # Fetch evidence
        evidence = []
        async with conn.execute("SELECT * FROM knowledge_evidence WHERE doc_id = ?", (doc_id,)) as e_cur:
            async for e_row in e_cur:
                evidence.append(KnowledgeEvidence(
                    id=e_row["id"], doc_id=e_row["doc_id"],
                    entity_type=e_row["entity_type"], entity_id=e_row["entity_id"],
                    relation_type=e_row["relation_type"], created_at=e_row["created_at"]
                ))

        return KnowledgeDocument(
            id=row["id"], slug=row["slug"], title=row["title"],
            tenant_id=row["tenant_id"], state=row["state"],
            current_revision_id=row["current_revision_id"],
            created_at=row["created_at"], updated_at=row["updated_at"],
            current_content=content, evidence=evidence
        )

    async def submit_revision(self, doc_id: str, content: str, author_id: str) -> KnowledgeRevision:
        conn = await get_connection()
        now = _utc_now()
        content_hash = _hash_content(content)

        # Get latest revision number
        async with conn.execute(
            "SELECT id, revision_num FROM knowledge_revisions WHERE doc_id = ? ORDER BY revision_num DESC LIMIT 1",
            (doc_id,)
        ) as cur:
            last = await cur.fetchone()
            rev_num = (last["revision_num"] + 1) if last else 1
            parent_id = last["id"] if last else None

        rev_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO knowledge_revisions (id, doc_id, revision_num, content, content_hash, author_id, parent_revision_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (rev_id, doc_id, rev_num, content, content_hash, author_id, parent_id, now),
        )

        # Update document state to IN_REVIEW
        await conn.execute(
            "UPDATE knowledge_documents SET current_revision_id = ?, state = 'IN_REVIEW', updated_at = ? WHERE id = ?",
            (rev_id, now, doc_id),
        )
        await conn.commit()
        return KnowledgeRevision(
            id=rev_id, doc_id=doc_id, revision_num=rev_num,
            content=content, content_hash=content_hash, author_id=author_id,
            parent_revision_id=parent_id, created_at=now
        )

    async def update_state(self, doc_id: str, new_state: str) -> bool:
        conn = await get_connection()
        now = _utc_now()
        await conn.execute(
            "UPDATE knowledge_documents SET state = ?, updated_at = ? WHERE id = ?",
            (new_state, now, doc_id),
        )
        await conn.commit()
        return conn.total_changes > 0

    async def search(self, query: str, limit: int = 10) -> List[KnowledgeSearchResult]:
        conn = await get_connection()
        search_pattern = f"%{query.lower()}%"

        results = []
        async with conn.execute(
            """
            SELECT d.id as doc_id, d.slug, d.title, d.state, c.content, c.header_path
            FROM knowledge_chunks c
            JOIN knowledge_documents d ON c.doc_id = d.id
            WHERE LOWER(c.content) LIKE ? OR LOWER(d.title) LIKE ?
            LIMIT ?
            """,
            (search_pattern, search_pattern, limit),
        ) as cur:
            async for row in cur:
                snippet = row["content"][:200] + ("..." if len(row["content"]) > 200 else "")
                results.append(KnowledgeSearchResult(
                    doc_id=row["doc_id"], slug=row["slug"], title=row["title"],
                    snippet=snippet, score=1.0, state=row["state"],
                    header_path=row["header_path"]
                ))

        return results

# Singleton instance
knowledge_repo = KnowledgeRepository()
