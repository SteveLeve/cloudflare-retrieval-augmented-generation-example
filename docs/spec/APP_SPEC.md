# Application Specification

Generated: 2025-11-22T21:44:14.578Z
Status: Draft
Owner: Engineering / AI Agents

## Purpose
Provide a complete, implementation-oriented specification enabling agentic coding systems to regenerate the core application (Cloudflare Workers RAG + Chat with memory, retrieval, citation integrity, security controls) without referencing existing source files.

## High-Level Overview
This is a Cloudflare Workers application exposing document ingestion, note storage, vector similarity retrieval, and conversational AI endpoints with multi-turn memory and document-constrained responses.

## Runtime & Framework
- Platform: Cloudflare Workers
- Framework: Hono (routing, middleware)
- Workflow Orchestration: Cloudflare Workflows (RAGWorkflow) for async ingestion
- Language: TypeScript (ES2022 target)

## Core Bindings
- D1 (binding: DATABASE)
- Vectorize (binding: VECTOR_INDEX)
- Workers AI (binding: AI) + optional Anthropic Claude via secret ANTHROPIC_API_KEY
- KV (binding: DOCUMENTS) for full document bodies
- Workflow (binding: RAG_WORKFLOW)

## Feature Flags (env vars)
- ENABLE_TEXT_SPLITTING (boolean, default true)
- ENABLE_CHAT_SUMMARIZATION (boolean, default false)
- ENABLE_RATE_LIMITING (boolean, default false)
- ENABLE_CITATION_VALIDATION (boolean, default true)
- MAX_CHAT_HISTORY (integer, default 12)
- MIN_SIMILARITY (float, default 0.65)

## Data Models
### documents (KV + D1 metadata)
- id (TEXT, primary key in D1 metadata table)
- title (TEXT, optional)
- contentType (TEXT, optional)
- metadata (JSON TEXT, optional)
- created_at (INTEGER unixepoch)

### notes (D1)
- id (TEXT primary key) also used as vector id
- text (TEXT chunk content)
- document_id (TEXT nullable if legacy note)
- chunk_index (INTEGER, optional)
- created_at (INTEGER unixepoch)

### conversations (D1)
- id (TEXT primary key)
- created_at (INTEGER unixepoch)

### messages (D1)
- id (TEXT primary key)
- conversation_id (TEXT FK -> conversations.id)
- role (TEXT: 'user' | 'assistant' | 'system-summary')
- content (TEXT)
- sources (TEXT nullable, JSON array of { id, text })
- created_at (INTEGER unixepoch)

## Vector Metadata (Vectorize)
Each vector record associated to note chunk:
- vector id = note.id
- metadata: { note_id, document_id, chunk_index }

## Ingestion Workflow Steps (RAGWorkflow)
1. Receive POST /notes with JSON body { text, title?, contentType?, metadata? }
2. Validate presence and size (KV limit ~25MiB)
3. Generate document UUID (if document-level ingestion) store full text in KV
4. Insert document metadata row (D1)
5. Text splitting (if ENABLE_TEXT_SPLITTING) using RecursiveCharacterTextSplitter (default chunkSize 1000, overlap 100)
6. For each chunk:
   - Insert into notes table (id auto / provided) with document_id
   - Generate embedding via @cf/baai/bge-base-en-v1.5 model (text: [chunk])
   - Store vector with metadata in VECTOR_INDEX
7. Mark workflow completion (log durations)

## Retrieval Flow (Query or Chat Turn)
1. Normalize user question (trim, collapse whitespace)
2. Generate embedding for question
3. Perform vector similarity search (topK=3 initially)
4. If similarity < MIN_SIMILARITY for top1, adopt guarded answer mode
5. Fetch associated note texts from D1 by ids
6. Construct context block including each note (format: [Source id=<id>] <truncated text>)
7. Build system prompt: policy + context + citation instructions + safety.
8. For conversation turns, build message history window (<= MAX_CHAT_HISTORY + optional system-summary)
9. Summarization: if history length exceeds MAX_CHAT_HISTORY and flag enabled, generate summary and collapse older messages.
10. Call AI provider:
    - Anthropic: messages array without system message; system passed separately.
    - Workers AI: system prompt included as first message role=system.
11. Post-process assistant output:
    - Parse citations pattern `[source: <id>]`
    - Validate each id is in retrieved set (if ENABLE_CITATION_VALIDATION)
    - Remove invalid citations and append note.
12. Persist assistant message with sources JSON (retrieved notes array truncated to 160 chars each)
13. Return JSON { role: 'assistant', content, sources } with headers x-model-used, x-source-count.

## Conversation Memory
- Fetch last N messages ordered ascending by created_at.
- Use summary message if present; never duplicate user message insertion; rely exclusively on persisted history.
- No manual timestamp fabrication; use RETURNING * pattern.

## Security & Abuse Controls
- Validate input length (< 4000 chars user message)
- Rate limit (if flag) 60 requests / 5 min per IP + per conversation
- Flood protection: if avg interval of last 5 user messages <2s return 429
- Prompt injection defense: system prompt includes refusal instructions; detect keywords ('ignore', 'system prompt') and reinforce constraints
- Sanitize text: remove control characters, trim, collapse whitespace

## Resilience
- Retry AI calls (2 attempts, exponential backoff 200ms, 400ms)
- Retry vector search once on transient network issues
- Circuit breaker: after 5 consecutive AI failures in 2 min -> fallback response (context-only)

## Performance / Metrics
Log phases with ms durations: embedding_generation, vector_search, ai_completion, db_read, db_write.
Maintain in-memory rolling window (size 50) of total latency to compute p50/p95 every 10th request.

## Endpoints Summary
- GET / -> question (?text=) returns { answer } with sources
- GET /ui -> HTML query UI
- GET /write -> HTML doc upload UI
- POST /notes -> ingest document/note
- GET /notes, GET /notes.json, DELETE /notes/:id (legacy)
- GET /documents, GET /documents/:id, GET /documents/ui
- Chat (future in PR5): POST /chat/conversations -> create conversation; GET /chat/conversations/:id -> history; POST /chat/conversations/:id/messages -> send message

## Validation Rules
- Title length <= 1000
- Content size after encoding *1.2 safety < KV limit
- For chat message ingestion: reject empty or whitespace-only messages
- Similarity threshold MIN_SIMILARITY gating fabrication

## AI Prompt Structure (System)
Sections:
1. Role & behavior constraints
2. Document usage rule: only use provided sources, cite with [source: <id>]
3. Safety & refusal policy
4. Context block (each source chunk)
5. Instruction: produce concise, factual answer + citation list at end.

## Citation Post-Processing
Regex pattern: /\[source:\s*([A-Za-z0-9_-]+)\]/g
Compare collected IDs to retrieved note id set; strip unmatched; add annotation.
Generate standardized citation block: `Sources: id1, id2, id3`.

## Summarization Specification
Trigger: message count > MAX_CHAT_HISTORY OR estimated tokens > 6000.
Prompt: "Summarize prior conversation focusing on user goals, constraints, and referenced source ids. Omit irrelevant chit-chat.".
Stored as role 'system-summary'.

## Error Responses
- 400 Validation error { error }
- 404 Not found { error }
- 413 Payload too large { error }
- 429 Rate limit { error, retryAfter }
- 500 Internal failure generic { error: 'Internal error' }

## Non-Goals
- Streaming responses (future enhancement)
- Fine-grained per-user auth (not included yet)

## Regeneration Guidance for Agents
To regenerate:
1. Recreate schema & bindings per Data Models & Core Bindings.
2. Implement ingestion workflow steps exactly in order.
3. Follow retrieval flow decision tree (similarity gating, adaptive topK).
4. Enforce security controls & flags.
5. Ensure prompt formatting & citation post-processing rules are exact.
6. Add metrics logging per Performance section.
7. Provide endpoints with defined JSON contract.

## Invariants
- message.created_at always from DB (unixepoch)
- No duplicate user message injection into history array
- sources JSON always either null or valid JSON array
- system prompt regenerated each turn with fresh context

## Open Questions
- Should adaptive topK escalate beyond 5?
- Consider embedding caching persistence beyond memory?

## Future Extensions
- Streaming token responses
- User authentication & per-user conversation isolation
- Scheduled vector index maintenance
