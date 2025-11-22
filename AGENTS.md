# General Purpose Agent Instructions

This file provides guidance for ANY AI assistant (Claude Code, GitHub Copilot, Cursor, ChatGPT, etc.) working with this codebase.

For comprehensive agent instructions, see **[docs/AGENTS.md](docs/AGENTS.md)** which contains:
- Complete project overview and tech stack
- Development guidelines and code standards
- Common tasks and workflows
- Architecture patterns
- Troubleshooting guide

## Quick Start for AI Assistants

### Project Type
Cloudflare RAG (Retrieval Augmented Generation) application using Workers, D1, KV, and Vectorize.

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
  └── utils/
      ├── logger.ts         # Structured logging
      └── document-store.ts # KV/D1/Vectorize abstraction

migrations/               # D1 database migrations
docs/                     # Documentation (ADRs, journal, guides)
tests/                    # Vitest unit tests
```

### Tech Stack Summary
- **Runtime**: Cloudflare Workers (edge compute)
- **Framework**: Hono (lightweight web framework)
- **Database**: D1 (SQLite at the edge)
- **Storage**: KV (key-value store for documents)
- **Vector Search**: Vectorize (semantic similarity)
- **AI Models**: Workers AI (Llama) or Anthropic Claude
- **Orchestration**: Cloudflare Workflows
- **Testing**: Vitest
- **Language**: TypeScript (strict mode)

### Documentation Standards

This project maintains comprehensive documentation:

1. **Architecture Decision Records (ADRs)**: `docs/decisions/`
   - Use template: `docs/decisions/TEMPLATE.md`
   - Document significant technical decisions
   - Reference ADRs in commits

2. **Development Journal**: `docs/DEVELOPMENT_JOURNAL.md`
   - Update after each session or milestone
   - Record decisions, challenges, solutions

3. **Agent Instructions**:
   - **Claude Code specific**: `CLAUDE.md` (root) and `docs/CLAUDE.md`
   - **General agents**: `AGENTS.md` (root) and `docs/AGENTS.md`

See **[docs/README.md](docs/README.md)** for complete documentation standards.

### Code Style Guidelines

**TypeScript**:
- Strict mode enabled
- Explicit types for function parameters
- Prefer interfaces over type aliases
- Use `const` over `let`

**Naming**:
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- Database tables: snake_case

**Error Handling**:
- Wrap Cloudflare binding calls in try/catch
- Use structured logger for error context
- User-friendly messages, detailed logs

**Testing**:
- Follow TDD practices (tests first)
- 80%+ coverage for business logic
- Mock Cloudflare bindings (see `tests/README.md`)

### Core Architecture Concepts

**Hybrid Storage Pattern** (See ADR 001):
- **KV**: Full document content (up to 25 MiB)
- **D1**: Metadata and relationships
- **Vectorize**: Embeddings with metadata

**RAG Query Flow**:
1. User question → embeddings
2. Vectorize finds similar notes
3. Retrieve chunks from D1
4. Load documents from KV
5. Construct context
6. AI generates response

**Document Ingestion Workflow**:
- Triggered via `POST /notes`
- Orchestrated by Cloudflare Workflows
- Stores in KV → D1 → Vectorize
- Optional text chunking with LangChain

### Important Notes

- **Vectorize**: Requires `remote: true` in wrangler.jsonc (no local dev)
- **Type Assertions**: Workers AI embeddings need type assertion `as { data: number[][] }`
- **Model Switching**: Uses Claude if `ANTHROPIC_API_KEY` secret is set
- **Text Splitting**: Controlled by `ENABLE_TEXT_SPLITTING` variable

### Where to Find Information

1. **Root `CLAUDE.md`**: Project architecture, commands, API endpoints
2. **docs/AGENTS.md**: Comprehensive agent instructions (you are here)
3. **docs/decisions/**: Architecture Decision Records
4. **docs/DEVELOPMENT_JOURNAL.md**: Recent changes and context
5. **tests/**: Examples of component usage

### When Working on This Project

1. **Before making changes**: Read relevant ADRs and check development journal
2. **For new features**: Create ADR if significant decision, update journal
3. **For code changes**: Follow TDD, use structured logging, update types
4. **For commits**: Reference ADRs, use conventional commit format
5. **For documentation**: Update CLAUDE.md, README.md, and journal as needed

---

**For complete agent instructions, see [docs/AGENTS.md](docs/AGENTS.md)**

**Last Updated**: 2025-11-21
