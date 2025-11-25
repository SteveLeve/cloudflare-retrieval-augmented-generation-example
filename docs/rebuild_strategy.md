# Rebuild Strategy: From Zero to Agentic RAG

This guide outlines the step-by-step strategy to rebuild this application in a greenfield environment. It is designed to be followed incrementally, establishing a solid foundation before adding complex agentic features.

## Phase 1: Foundation & Infrastructure
**Goal**: Establish the Cloudflare Workers environment and provision necessary storage resources.

1.  **Project Initialization**:
    - Initialize a new Cloudflare Worker project: `npm create cloudflare@latest`.
    - Configure `wrangler.jsonc` for TypeScript and ES modules.
2.  **Resource Provisioning**:
    - **D1 Database**: Create database (`wrangler d1 create`) and define schema for `documents` and `notes`.
    - **Vectorize Index**: Create index (`wrangler vectorize:index create`) with `bge-base-en-v1.5` preset.
    - **KV Namespace**: Create namespace (`wrangler kv:namespace create`) for raw document storage.
3.  **Bindings**:
    - Connect all resources in `wrangler.jsonc`.

## Phase 2: Core Logic & Ingestion
**Goal**: Enable the system to store and retrieve knowledge.

1.  **Document Store Utility**:
    - Implement `DocumentStore` class to abstract D1, KV, and Vectorize operations.
2.  **Ingestion API**:
    - Create `POST /notes` endpoint.
    - Implement text splitting logic (LangChain `RecursiveCharacterTextSplitter`).
    - Implement embedding generation using Workers AI (`@cf/baai/bge-base-en-v1.5`).
3.  **Vector Search**:
    - Implement `GET /` endpoint to test vector similarity search and context retrieval.

## Phase 3: Asynchronous Workflows
**Goal**: Make ingestion robust and scalable using Cloudflare Workflows.

1.  **Workflow Definition**:
    - Define `RAGWorkflow` class extending `WorkflowEntrypoint`.
    - Move ingestion logic (splitting, embedding, saving) into workflow steps.
2.  **Integration**:
    - Update `POST /notes` to trigger the workflow instead of processing synchronously.
    - Add logging to track workflow execution steps.

## Phase 4: Conversational AI (The "Chat" Layer)
**Goal**: Turn a search engine into a chatbot.

1.  **Schema Update**:
    - Add `conversations` and `messages` tables to D1.
2.  **Chat Endpoints**:
    - Implement `POST /chat/conversations` and `POST /messages`.
3.  **RAG Integration**:
    - Implement the "Retrieve-Then-Generate" loop:
        - Embed user query.
        - Retrieve relevant chunks.
        - Construct system prompt with context.
        - Call LLM (Workers AI Llama or Anthropic Claude).
4.  **Context Management**:
    - Implement history windowing (last N messages).
    - Add source citation logic to the system prompt.

## Phase 5: Agentic Polish & CI/CD
**Goal**: Professionalize the repository with agentic workflows.

1.  **Observability**:
    - Add structured logging throughout the application.
2.  **Testing**:
    - Set up Vitest for unit and integration testing.
3.  **Agentic Workflows**:
    - Create `.github/workflows` for CI checks.
    - Integrate **Claude Code** or similar tools for automated PR reviews.
    - Add `docs/spec/` directory with `APP_SPEC.md` to guide AI agents in future maintenance.

## Key Configuration Reference
- **Embeddings**: `@cf/baai/bge-base-en-v1.5` (768 dimensions).
- **Chunking**: ~1000 characters with 100 overlap.
- **Similarity Threshold**: 0.65 (recommended starting point).
