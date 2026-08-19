-- V1 Initial Schema for Knowledge MCP

CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE revision_state AS ENUM ('CANDIDATE', 'REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    slug VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE knowledge_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    state revision_state NOT NULL DEFAULT 'CANDIDATE',
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_indexed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    fts_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    embedding vector(1536), -- Example dimension size
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chunks_fts ON knowledge_chunks USING GIN (fts_vector);
CREATE INDEX idx_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_l2_ops);

CREATE TABLE review_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    reviewer_id UUID NOT NULL,
    decision revision_state NOT NULL,
    evidence TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    remote_id VARCHAR(255) NOT NULL,
    remote_hash VARCHAR(255) NOT NULL,
    verification_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
