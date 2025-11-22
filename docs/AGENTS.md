# General Purpose Agent Instructions

This file provides guidance for ANY AI assistant (Claude Code, GitHub Copilot, Cursor, ChatGPT, etc.) working with this codebase.

## Project Overview

**Name**: Cloudflare RAG Example
**Type**: Retrieval Augmented Generation (RAG) Application
**Platform**: Cloudflare Workers
**Language**: TypeScript

**Purpose**: Demonstrate how to build a production-grade RAG application using Cloudflare's edge platform, combining vector embeddings, database storage, and AI text generation.

## Quick Reference

### Tech Stack
- **Runtime**: Cloudflare Workers (edge compute)
- **Framework**: Hono (lightweight web framework)
- **Database**: D1 (SQLite at the edge)
- **Storage**: KV (key-value store for documents)
- **Vector Search**: Vectorize (semantic similarity)
- **AI Models**: Workers AI (Llama) or Anthropic Claude
- **Embeddings**: `@cf/baai/bge-base-en-v1.5`
- **Orchestration**: Cloudflare Workflows
- **Testing**: Vitest
- **Language**: TypeScript (strict mode)

### Key Commands
```bash
npm install           # Install dependencies
npm run start         # Local development server
npm test              # Run test suite
npm run deploy        # Deploy to Cloudflare
npx tsc --noEmit      # Type check without build
```

### Project Structure
```
src/
  ├── index.ts              # Main app: routes, workflow
  ├── types/index.ts        # TypeScript type definitions
  ├── utils/
  │   ├── logger.ts         # Structured logging
  │   └── document-store.ts # KV/D1/Vectorize abstraction
  └── *.html                # UI templates

migrations/
  └── *.sql                 # D1 database migrations

docs/
  ├── decisions/            # Architecture Decision Records
  └── DEVELOPMENT_JOURNAL.md # Development history

tests/
  └── *.test.ts            # Vitest unit tests
```

## Core Concepts

### 1. Hybrid Storage Architecture

**Design Pattern**: Separate content storage from metadata/relationships

**Components**:
- **KV**: Stores full document content (up to 25 MiB)
  - Key format: `doc:{uuid}`
  - Global edge caching for fast reads
- **D1**: Stores metadata and relationships
  - `documents` table: metadata, titles, timestamps
  - `notes` table: text chunks with document_id foreign keys
- **Vectorize**: Stores embeddings with metadata
  - Metadata includes: `document_id`, `note_id`, `chunk_index`

**Rationale**: See `docs/decisions/001-document-storage-strategy.md`

### 2. RAG Query Flow

1. User submits question → embeddings generated
2. Vectorize finds top K similar notes
3. Retrieve note chunks from D1
4. Load full documents from KV (via document_id metadata)
5. Construct context from chunks + documents
6. AI generates response using context

### 3. Document Ingestion Workflow

1. POST /notes → document uploaded
2. RAGWorkflow triggered (Cloudflare Workflows)
3. Document stored in KV with UUID
4. Metadata record created in D1
5. Text optionally split into chunks
6. Chunks stored in D1 notes table
7. Embeddings generated for each chunk
8. Vectors stored in Vectorize with metadata

**All steps tracked as workflow steps for reliability**

### 4. Chat Feature (Conversation Memory)

- **Tables**: `conversations`, `messages`
- **System Prompt**: 5-rule enforcement for RAG constraints
- **Source Attribution**: Retrieved documents shown with IDs
- **Memory**: Full conversation history persisted in D1

## Development Guidelines

### Code Style

**TypeScript**:
- Strict mode enabled
- Explicit types for all function parameters
- Use interfaces over type aliases for object shapes
- Prefer `const` over `let`

**Naming Conventions**:
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- Database tables: snake_case

**Error Handling**:
- Always wrap Cloudflare binding calls in try/catch
- Log errors with context using structured logger
- Return user-friendly error messages
- Include error details in logs only

**Comments**:
- JSDoc for public functions
- Inline comments for complex logic only
- Avoid obvious comments
- Reference ADRs for architectural decisions

### Testing Standards

**Test Coverage Goals**:
- Utilities: 90%+ coverage
- Business logic: 80%+ coverage
- Integration: Key happy paths + error scenarios

**Mocking Strategy**:
- Mock Cloudflare bindings (KV, D1, Vectorize, AI)
- See `tests/README.md` for mocking patterns
- Keep mocks simple and focused

**Test Organization**:
- One describe block per class/module
- Group related tests together
- Use descriptive test names
- Test both success and error paths

### Commit Standards

**Format**:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring
- `chore`: Build/config changes

**Footer**:
```
Refs: ADR 001

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
```

### Documentation Requirements

**Always document**:
- Significant architectural decisions (ADR)
- Major feature implementations (feature docs)
- Development sessions (journal updates)
- API changes (README + CLAUDE.md)

**See**: `docs/README.md` for full documentation standards

## Common Tasks

### Adding a New Feature

1. **Plan & Design**:
   - Create ADR if significant decision
   - Update development journal (session start)
   - Design database schema if needed

2. **Implement**:
   - Follow TDD: write tests first
   - Implement feature incrementally
   - Add structured logging
   - Update types in `src/types/index.ts`

3. **Document**:
   - Update root `CLAUDE.md` if architecture changed
   - Update root `README.md` if user-facing
   - Create feature docs if complex
   - Update development journal (session end)

4. **Test & Deploy**:
   - Verify all tests pass (`npm test`)
   - Type check (`npx tsc --noEmit`)
   - Test locally (`npm run start`)
   - Deploy (`npm run deploy`)

### Adding a New Endpoint

1. **Define Types**: Add to `src/types/index.ts`
2. **Implement Handler**: In `src/index.ts`
3. **Add Logging**: Use structured logger
4. **Error Handling**: Wrap in try/catch
5. **Update Docs**: Add to API endpoints in `CLAUDE.md`
6. **Write Tests**: Add integration tests if needed

### Modifying Database Schema

1. **Create Migration**: `migrations/NNNN_description.sql`
2. **Update Types**: Modify `src/types/index.ts`
3. **Update DocumentStore**: If KV/D1 logic changes
4. **Test Locally**: `wrangler d1 migrations apply DATABASE`
5. **Document**: Reference migration in commit message

### Working with Workflows

**Pattern**: Cloudflare Workflows provide reliability for multi-step operations

**Example** (`RAGWorkflow`):
```typescript
async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
  // Each step is tracked independently
  const documentId = await step.do('create document', async () => {
    // Step logic here
  });

  const chunks = await step.do('split text', async () => {
    // Another step
  });
}
```

**Guidelines**:
- Keep steps focused and atomic
- Use descriptive step names
- Log within each step
- Handle errors at step level

## Architecture Patterns

### Structured Logging

**Always use**: `createLogger()` from `src/utils/logger.ts`

```typescript
const logger = createLogger({ endpoint: 'GET /api' });
logger.info('Processing request', { userId, documentId });
logger.startTimer('operation');
// ... do work
logger.endTimer('operation', { success: true });
```

**Benefits**:
- Consistent log format
- Context propagation
- Performance tracking
- Searchable structured data

### DocumentStore Abstraction

**Pattern**: Encapsulate KV/D1/Vectorize operations

```typescript
const docStore = new DocumentStore(env, logger);
await docStore.createDocument(input, documentId);
const doc = await docStore.getDocument(documentId);
```

**Why**:
- Single source of truth for storage operations
- Consistent error handling
- Easier to test (mock DocumentStore)
- Centralizes logging

### Type Safety

**All Cloudflare bindings typed**:
```typescript
const embeddings = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
  text: [question]
}) as { data: number[][] }  // Type assertion required
```

**Database results typed**:
```typescript
const { results } = await env.DATABASE
  .prepare('SELECT * FROM notes WHERE id = ?')
  .bind(noteId)
  .first<NoteRecord>();
```

## Troubleshooting

### Common Issues

**1. Vectorize not working locally**
- Vectorize requires `remote: true` in wrangler.jsonc
- Cannot test vector operations in local dev
- Solution: Deploy to test, or use remote bindings

**2. TypeScript errors in tests**
- Mock implementations must match full interface
- Use proper overload declarations
- See `tests/document-store.test.ts` for examples

**3. KV not persisting locally**
- Local KV is in-memory only
- Restart wrangler dev = lost data
- Solution: Use `--persist` flag or test remotely

**4. D1 migrations not applying**
- Check migrations order (sequential numbers)
- Verify wrangler.jsonc database_id is correct
- Run with `--remote` for production

### Debug Commands

```bash
# Check types
npx tsc --noEmit

# Run tests with verbose output
npm test -- --reporter=verbose

# Tail remote logs
wrangler tail

# Check D1 database
wrangler d1 execute DATABASE --command="SELECT * FROM notes" --remote

# List KV keys
wrangler kv:key list --namespace-id=<id>
```

## Security Considerations

### Input Validation
- Always validate user input
- Check content size limits (25 MiB for KV)
- Sanitize metadata fields
- Use parameterized queries (D1)

### API Keys
- Store in Cloudflare secrets: `wrangler secret put KEY_NAME`
- Never commit secrets to git
- Use environment variables via `wrangler.jsonc` vars

### Rate Limiting
- Consider adding rate limits for public endpoints
- Use Durable Objects for per-user limits
- Monitor Workers analytics

## Resources

### Documentation
- Root `README.md`: User-facing project documentation
- Root `CLAUDE.md`: Claude Code specific instructions
- `docs/README.md`: Documentation standards
- `docs/decisions/`: Architecture Decision Records
- `docs/DEVELOPMENT_JOURNAL.md`: Development history

### Cloudflare Resources
- [Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Docs](https://developers.cloudflare.com/d1/)
- [KV Docs](https://developers.cloudflare.com/kv/)
- [Vectorize Docs](https://developers.cloudflare.com/vectorize/)
- [Workflows Docs](https://developers.cloudflare.com/workflows/)

### Testing
- `tests/README.md`: Testing documentation
- [Vitest Docs](https://vitest.dev/)

## Getting Help

### Where to Look First
1. Root `CLAUDE.md` - Project architecture and commands
2. `docs/decisions/` - Why specific decisions were made
3. `docs/DEVELOPMENT_JOURNAL.md` - Recent changes and context
4. Test files - Examples of how to use components

### When to Create an Issue
- Bug in production
- Feature request with clear use case
- Documentation error or unclear section

### When to Create ADR
- Choosing between technical alternatives
- Significant architectural change
- New pattern or convention
- Trade-off with long-term impact

---

**Project Status**: Active development
**Last Updated**: 2025-11-21
**Documentation**: Comprehensive and maintained
**Test Coverage**: 19/19 tests passing

For agent-specific instructions:
- **Claude Code**: See `docs/CLAUDE.md`
- **General agents**: This file
