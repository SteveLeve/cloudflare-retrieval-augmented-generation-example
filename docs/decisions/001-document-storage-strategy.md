# ADR 001: Document Storage Strategy

**Date**: 2025-11-18
**Status**: Accepted
**Decision Makers**: Development Team

## Context

The current RAG application stores text chunks directly in D1 database without preserving the original source documents. This creates several limitations:

1. No way to retrieve the original full document
2. Cannot track which chunks belong to which source document
3. Difficult to manage document versions or updates
4. No document metadata (title, upload date, author, etc.)

We need to store full source documents and link chunks back to their sources.

## Decision

We will use **Cloudflare KV** to store full source documents, with D1 storing only metadata and chunk references.

## Rationale

### KV Advantages
- **Simplicity**: Key-value storage is perfect for document blobs
- **Performance**: Globally distributed edge caching
- **Size limits**: Up to 25 MiB per value (sufficient for most documents)
- **Cost-effective**: Optimized for read-heavy workloads (RAG queries)
- **API simplicity**: Simple get/put/delete operations

### D1 Alternatives Considered
- **Pros**: Relational structure, SQL queries, transactions
- **Cons**:
  - SQLite blob storage less optimized for large documents
  - Row size limits (1 MB practical limit)
  - Would require chunking documents into multiple rows
  - More complex queries for simple document retrieval

### Hybrid Approach (Chosen)
- **KV**: Store full document content (keyed by document_id)
- **D1**: Store document metadata, notes/chunks with foreign keys to documents
- **Vectorize**: Store embeddings with document_id in metadata

## Schema Design

### KV Structure
```
Key: doc:{uuid}
Value: {
  content: string,
  contentType: string,
  uploadedAt: timestamp,
  metadata: object
}
```

### D1 Tables
```sql
-- New documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT,
  uploaded_at INTEGER NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  metadata TEXT -- JSON string
);

-- Updated notes table
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  text TEXT NOT NULL,
  chunk_index INTEGER,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

### Vectorize Metadata
Each vector will include:
```json
{
  "document_id": "uuid",
  "note_id": "uuid",
  "chunk_index": 0
}
```

## Consequences

### Positive
- Clear separation of concerns (content vs metadata)
- Fast document retrieval from edge locations
- Easy to implement document versioning later
- Better analytics on document usage
- Can show source citations in AI responses

### Negative
- Additional KV namespace to manage
- Need to keep KV and D1 in sync (eventual consistency)
- Slightly more complex deletion logic (KV + D1 + Vectorize)

### Mitigation
- Use transactions where possible
- Implement cleanup workflow for orphaned KV entries
- Add verbose logging for debugging sync issues

## Implementation Notes

1. Create KV namespace: `wrangler kv:namespace create DOCUMENTS`
2. Add binding to wrangler.jsonc
3. Create D1 migration for new schema
4. Update workflow to coordinate storage across all three services
5. Add comprehensive error handling and rollback logic
