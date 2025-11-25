# Learning Journey: AI Engineering Learning Path

This project serves as a key experiment in my broader **AI Engineering learning path**, documenting the evolution from basic serverless concepts to advanced agentic workflows.

## Project Timeline & Evolution

### **Phase 1: The Foundation (Sep 2023 - Jan 2024)**
*Starting with the basics of Cloudflare Workers AI.*

- **2023-09-26**: Initial commit. Started as a standard tutorial for Cloudflare Workers AI.
- **2023-11-08**: Added experimental UI. Learned how to bridge serverless backends with simple frontends for AI demos.
- **2024-01-10**: Routine updates. Maintained the project as a reference implementation.

### **Phase 2: Modernization & Infrastructure (Oct 2024 - Nov 2024)**
*Transitioning to production-grade architecture.*

- **2024-10-28**: **Major Refactor**. Integrated TypeScript and **Cloudflare Workflows**.
    - *Learning*: Moving from synchronous functions to durable, asynchronous execution for reliability.
- **2025-11-10**: Modernized configuration to `wrangler.jsonc`.
- **2025-11-11**: **Hybrid Storage Implementation**.
    - Provisioned D1 (SQL), Vectorize (Embeddings), and KV (Blob storage).
    - *Learning*: Designing a scalable data architecture for RAG that balances cost, speed, and query flexibility.
- **2025-11-11**: Enabled observability. Learned the importance of structured logging in debugging complex AI pipelines.

### **Phase 3: The Agentic Shift (Nov 2025)**
*Embracing AI agents as collaborators.*

- **2025-11-16**: Integrated **Claude Code** workflows.
    - Added "Claude PR Assistant" and "Claude Code Review" GitHub Actions.
    - *Learning*: Automating the software development lifecycle (SDLC) with AI agents.
- **2025-11-20**: Refined document storage logic with agentic assistance.
- **2025-11-22**: **Agentic Specifications**.
    - Created `docs/spec/APP_SPEC.md` and `CHAT_WORKFLOW_SPEC.md`.
    - *Learning*: Writing "documentation for machines"—specifications designed explicitly for AI agents to read and follow.
- **2025-11-24**: **Advanced RAG Features**.
    - Implemented full chat memory and document-constrained responses (Guard Mode).
    - *Learning*: Managing context windows and preventing hallucinations in conversational AI.
- **2025-11-25**: **Sub-Agent Development**.
    - Experimented with interactive sub-agent creation (not using Claude Code dialogue).
    - *Learning*: Orchestrating multiple specialized agents to solve complex tasks.

## Key Concepts Mastered

### 1. Serverless AI Engineering
- **Vector Search**: Deep dive into embeddings (`bge-base-en-v1.5`), dimensions, and similarity search.
- **RAG Architecture**: Mastering chunking strategies, context window management, and prompt engineering for grounded answers.
- **Edge Computing**: Deploying low-latency AI logic using Cloudflare Workers.

### 2. System Design & Reliability
- **Asynchronous Processing**: Using durable workflows to handle long-running ingestion tasks without timeouts.
- **Hybrid Storage Patterns**: Combining Relational (D1), Key-Value (KV), and Vector databases to solve specific retrieval challenges efficiently.

### 3. Agentic Workflows
- **AI-First Documentation**: Shifting from human-centric docs to agent-centric specifications.
- **Tool Use**: Leveraging MCP (Model Context Protocol) and sub-agents to accelerate development.
- **Automated Review**: Using AI agents as a first line of defense in Code Review (CI/CD).

## Conclusion
What began as a simple tutorial has evolved into a sophisticated testbed for **AI Engineering**. This repository now demonstrates a production-ready RAG system built with an "AI-native" mindset, leveraging agents not just for code generation, but for maintenance, review, and architectural evolution.
