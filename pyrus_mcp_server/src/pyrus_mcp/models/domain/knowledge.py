from typing import Optional, List
from datetime import datetime
from pydantic import Field
from .common import PyrusBaseModel

class KnowledgeEvidence(PyrusBaseModel):
    id: str
    doc_id: str
    entity_type: str  # pyrus_task, pyrus_form, url, commit
    entity_id: str
    relation_type: str  # solves, documents, relates_to, generated_from
    created_at: str

class KnowledgeChunk(PyrusBaseModel):
    id: str
    doc_id: str
    revision_id: str
    chunk_index: int
    header_path: Optional[str] = None
    content: str
    token_count: int = 0
    created_at: str

class KnowledgeRevision(PyrusBaseModel):
    id: str
    doc_id: str
    revision_num: int
    content: str
    content_hash: str
    author_id: str
    parent_revision_id: Optional[str] = None
    created_at: str

class KnowledgeDocument(PyrusBaseModel):
    id: str
    slug: str
    title: str
    tenant_id: str
    state: str = "DRAFT"  # DRAFT, IN_REVIEW, APPROVED, PUBLISHED, DEPRECATED
    current_revision_id: Optional[str] = None
    created_at: str
    updated_at: str
    current_content: Optional[str] = None
    evidence: List[KnowledgeEvidence] = Field(default_factory=list)

class KnowledgeSearchResult(PyrusBaseModel):
    doc_id: str
    slug: str
    title: str
    snippet: str
    score: float
    state: str
    header_path: Optional[str] = None
