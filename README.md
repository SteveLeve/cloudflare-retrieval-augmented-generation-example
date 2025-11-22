# cloudflare-retrieval-augmented-generation-example

This repo shows how to build a Retrieval Augmented Generation (RAG) application using Cloudflare Workers AI. It uses Cloudflare Workflows, D1, Vectorize, and KV to store documents with full metadata tracking that can be used to generate context for the RAG model. You can then use Cloudflare AI's Llama-based models, or Anthropic Claude to generate responses with source attribution.

This project was created as part of a tutorial on [Building a Retrieval Augmented Generation (RAG) Application with Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/tutorials/build-a-retrieval-augmented-generation-ai/). If you want a guided walkthrough of the steps in this repo, check out the tutorial.

## Features

- **Document Storage**: Full documents stored in Cloudflare KV with metadata in D1
- **Source Attribution**: Query responses include source document information
- **Metadata Tracking**: Store document title, author, tags, description, and custom metadata
- **Text Chunking**: Automatic text splitting for optimal RAG performance
- **Verbose Logging**: Comprehensive logging for debugging and monitoring
- **Vector Search**: Semantic similarity search using Cloudflare Vectorize

## Installation/Setup

You must have a Cloudflare account and the `wrangler` CLI installed (or use `npx wrangler`).

Clone the repo and install dependencies:

```bash
$ git clone https://github.com/cloudflare/cloudflare-retrieval-augmented-generation-example.git
$ cd cloudflare-retrieval-augmented-generation-example
$ npm install
```

Generate a new database, vector index, and KV namespace:

```bash
# Create D1 database
$ wrangler d1 create DATABASE

# Create Vectorize index
$ wrangler vectorize:index create VECTOR_INDEX --preset "@cf/baai/bge-base-en-v1.5"

# Create KV namespace for document storage
$ wrangler kv:namespace create DOCUMENTS
```

Apply the migrations to create the database schema:

```bash
# Apply locally for development
$ wrangler d1 migrations apply DATABASE

# Apply to production
$ wrangler d1 migrations apply DATABASE --remote
```

This will create the `documents` and `notes` tables with proper foreign key relationships.

Add the configuration to `wrangler.jsonc`, replacing placeholder values with your own:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DATABASE",
      "database_name": "<your database name>",
      "database_id": "<your database id>"
    }
  ],
  "vectorize": [
    {
      "binding": "VECTOR_INDEX",
      "index_name": "<your vector index name>"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "DOCUMENTS",
      "id": "<your kv namespace id>"
    }
  ]
}
```

Deploy the application:

```bash
$ npm run deploy
```

## Usage

After deploying, you can use the following routes:

### Query Endpoints
- `GET /` - Query endpoint that accepts a `?text` query param and returns an AI-generated response with context from the knowledge base
- `GET /ui` - Web UI for asking questions and getting AI responses with source attribution

### Document Management
- `GET /write` - Web UI for uploading documents with metadata (title, author, tags, etc.)
- `POST /notes` - API endpoint to upload documents programmatically
- `GET /documents` - JSON endpoint listing all documents with metadata
- `GET /documents/:id` - JSON endpoint to retrieve a specific document with full content and chunks
- `GET /documents/ui` - Web UI to browse all stored documents

### Legacy Endpoints (Notes)
- `GET /notes` - Web UI showing all note chunks (legacy view)
- `GET /notes.json` - JSON endpoint returning all note chunks
- `DELETE /notes/:id` - Delete a specific note chunk

### API Example

Upload a document with metadata:

```bash
curl -X POST https://your-worker.workers.dev/notes \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your document content here...",
    "title": "Product Documentation",
    "contentType": "text/markdown",
    "metadata": {
      "author": "Engineering Team",
      "source": "https://docs.example.com",
      "tags": ["product", "api", "reference"],
      "description": "API reference documentation"
    }
  }'
```

Query the knowledge base:

```bash
curl "https://your-worker.workers.dev/?text=How+do+I+authenticate"
```

The response will include:
- AI-generated answer
- `x-model-used` header indicating which model was used
- `x-source-count` header showing how many source documents were used
- `x-sources` header with JSON array of source documents (title, similarity score, etc.)

### Changing the model

If you would like to use Anthropic Claude instead of Workers AI, set the secret `ANTHROPIC_API_KEY` in your Workers application:

```bash
$ wrangler secret put ANTHROPIC_API_KEY your-api-key
```

Once you've set this secret, all text generation will be done by Claude.

### Recursive text splitting

By default, this app uses Langchain's `RecursiveCharacterTextSplitter` to split text into chunks. This is a recommended approach for taking large pieces of text and formatting them for RAG use-cases. You can turn this off by setting the `ENABLE_TEXT_SPLITTER` variable in `wrangler.jsonc` to `false`:

```jsonc
{
  "vars": {
    "ENABLE_TEXT_SPLITTING": false
  }
}
```

## Architecture

### Hybrid Storage Strategy

This application uses a hybrid storage approach for optimal performance and flexibility:

1. **Cloudflare KV**: Stores full document content
   - Fast, globally distributed edge storage
   - Supports up to 25 MiB per document
   - Optimized for read-heavy workloads

2. **D1 (SQLite)**: Stores metadata and relationships
   - Document metadata (title, author, tags, etc.)
   - Note chunks with references to source documents
   - Relational queries for filtering and searching

3. **Vectorize**: Stores embeddings with metadata
   - Vector embeddings for semantic search
   - Metadata includes document_id, note_id, chunk_index
   - Fast similarity search for RAG queries

### Document Ingestion Workflow

When a document is uploaded via `POST /notes`:

1. **Document Storage** - Full content saved to KV with generated UUID
2. **Metadata Storage** - Document metadata saved to D1 documents table
3. **Text Splitting** - Optional chunking using RecursiveCharacterTextSplitter
4. **Chunk Storage** - Each chunk saved to D1 notes table with document_id reference
5. **Embedding Generation** - Vector embeddings created for each chunk
6. **Vector Storage** - Embeddings stored in Vectorize with document metadata

All steps are orchestrated by Cloudflare Workflows for reliability and observability.

### Verbose Logging

The application includes comprehensive structured logging throughout:

```typescript
// Logs include context, timing, and structured data
logger.info('Creating document', { documentId, title });
logger.startTimer('createDocument');
// ... operation ...
logger.endTimer('createDocument', { success: true });
```

Logs appear in:
- Local development: Console output via `wrangler dev`
- Production: Cloudflare Workers Logs and Analytics

## Development

### Project Structure

```
src/
  ├── index.ts              # Main application (API routes, workflow)
  ├── types/
  │   └── index.ts          # TypeScript type definitions
  ├── utils/
  │   ├── logger.ts         # Structured logging utility
  │   └── document-store.ts # Document/KV/D1 management
  └── *.html                # UI templates

migrations/
  ├── 0001_create_notes_table.sql
  └── 0002_add_documents_and_metadata.sql

docs/
  ├── decisions/            # Architecture Decision Records (ADRs)
  └── DEVELOPMENT_JOURNAL.md

tests/
  └── *.test.ts            # Vitest unit tests
```

### Running Tests

```bash
# Install test dependencies first
npm install --save-dev vitest @vitest/coverage-v8

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

See `tests/README.md` for detailed testing documentation.

### Decision Records

Architecture decisions are documented in `docs/decisions/` following the ADR pattern. See `docs/decisions/001-document-storage-strategy.md` for the rationale behind the hybrid KV+D1 approach.

## Contributing

1. Work in a feature branch
2. Follow TDD practices (tests first)
3. Add decision records for significant architectural changes
4. Update development journal with progress notes
5. Create detailed, incremental commits
6. Submit PR with comprehensive description

## Specification Documents

Formal application and workflow specifications are maintained under `docs/spec/`:
- `APP_SPEC.md` (core architecture, ingestion, retrieval, security, resilience, regeneration guidance)
- `CHAT_WORKFLOW_SPEC.md` (multi-turn chat, memory management, summarization, citation validation, rate limiting)

AI agents contributing to this repository must consult these specs before implementing changes. See `agents.md` for agent behavior guidelines.

## License

MIT
