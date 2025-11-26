# System Capabilities & Architecture

## Overview
This project is a serverless Retrieval Augmented Generation (RAG) application built on Cloudflare's developer platform. It demonstrates a modern, scalable approach to building AI-powered knowledge bases with document retrieval, conversational memory, and agentic workflows.

## Core Capabilities

### 1. Retrieval Augmented Generation (RAG)
- **Hybrid Storage Architecture**: Combines multiple storage engines for optimal performance:
    - **Cloudflare KV**: Stores full document content (up to 25 MiB per file) for low-latency edge access.
    - **Cloudflare D1 (SQLite)**: Manages structured metadata, relationships, and conversation history.
    - **Cloudflare Vectorize**: Handles semantic embeddings for fast similarity search.
- **Document Ingestion**:
    - Asynchronous processing via **Cloudflare Workflows**.
    - Automatic text splitting (recursive character splitting) for optimal chunking.
    - Metadata extraction and preservation.
- **Context-Aware Retrieval**:
    - Vector similarity search using `bge-base-en-v1.5` embeddings.
    - Adaptive context window construction.
    - Source attribution with strict citation validation.

### 2. Conversational AI Interface
- **Multi-Turn Chat**: Maintains conversation history with context preservation.
- **Model Flexibility**: Supports both:
    - **Cloudflare Workers AI** (Llama 3.1) for cost-effective, edge-native inference.
    - **Anthropic Claude** (via API) for high-reasoning capabilities.
- **Smart Context Management**:
    - Automatic summarization of long conversations to maintain context within token limits.
    - "Guard Mode": Refuses to answer if retrieved documents are insufficient (hallucination prevention).
- **Rate Limiting & Security**:
    - IP-based rate limiting.
    - Input sanitization and validation.

### 3. Data Management
- **Full System Reset**:
    - "Clear All" feature to wipe all documents, vectors, and conversation history.
    - Useful for development and testing cycles.

### 4. Agentic Engineering & CI/CD
- **AI-Assisted Development**:
    - **Claude Code Integration**: Integrated workflows for AI-driven code reviews and pull request assistance.
    - **MCP (Model Context Protocol)**: Ready for integration with agentic IDEs and tools.
- **Automated Workflows**:
    - GitHub Actions for continuous integration and automated code quality checks.
    - Structured logging and observability for debugging agent interactions.

## Technical Architecture

### Infrastructure Components
| Component | Purpose | Binding Name |
|-----------|---------|--------------|
| **Workers** | Core application logic and API endpoints | `rag` |
| **Workflows** | Orchestrates async document ingestion | `RAG_WORKFLOW` |
| **D1** | Relational data (notes, conversations, metadata) | `DATABASE` |
| **Vectorize** | Vector embeddings index | `VECTOR_INDEX` |
| **KV** | Blob storage for raw document text | `DOCUMENTS` |
| **Workers AI** | Embedding generation and LLM inference | `AI` |

### Data Flow
1.  **Ingestion**: User uploads doc -> API triggers Workflow -> Text Split -> Embed -> Store in KV/D1/Vectorize.
2.  **Query**: User asks question -> Embed question -> Vector Search -> Retrieve Chunks -> Construct Prompt -> LLM Inference -> Response.

## API Surface
- `POST /notes`: Ingest new documents.
- `GET /chat/conversations`: Manage chat sessions.
- `POST /chat/conversations/:id/messages`: Send messages and receive RAG responses.
- `GET /documents`: List stored knowledge base.
