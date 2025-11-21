# Chat Feature Quick Start Guide

## Overview
The chat feature at `/chat` provides a conversational AI interface with RAG (Retrieval Augmented Generation) capabilities and full conversation memory.

## Key Features

### 1. **Conversation Memory**
- Each chat session has a unique conversation ID
- All messages persisted in D1 database
- History preserved across page refreshes
- Chronological message ordering with timestamps

### 2. **RAG-Constrained Responses**
- AI only responds using information from uploaded documents
- System prompt with 5 rules prevents hallucinations
- Automatic fallback message when no relevant documents found
- Source citations for traceability

### 3. **Source Attribution**
- Retrieved documents displayed below each response
- Shows document chunk ID and preview text
- Visual styling with green border for easy scanning
- Multiple sources supported (top 3 most relevant)

## Quick Start

### 1. Start the Development Server
```bash
npm run start
```
The server runs at http://localhost:8787

### 2. Add Documents to Knowledge Base
**Option A: Using Web UI**
1. Navigate to http://localhost:8787/write
2. Paste your document content
3. Click "Add Document"
4. Wait for embedding generation

**Option B: Using API**
```bash
curl -X POST http://localhost:8787/notes \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your document content here...",
    "title": "Document Title",
    "contentType": "text/markdown",
    "metadata": {
      "author": "Author Name",
      "tags": ["tag1", "tag2"]
    }
  }'
```

### 3. Start Chatting
1. Navigate to http://localhost:8787/chat
2. New conversation automatically created
3. Ask questions about your documents
4. See full conversation history with sources

## Example Conversation

**Scenario**: You uploaded a document about "Cloudflare Workers Architecture"

### User Message
```
What are the main benefits of using Cloudflare Workers?
```

### Assistant Response
```
Based on the retrieved documents, Cloudflare Workers offers several main benefits:

1. Global Edge Deployment [ID: abc-123]
2. Serverless Execution [ID: def-456]
3. Zero Cold Start Performance [ID: ghi-789]

[... actual content from documents ...]
```

**Sources Displayed Below**:
```
📚 Sources:
┌─ ID: abc-123
│  "Cloudflare Workers deploy globally to 300+ data centers..."
└─

┌─ ID: def-456
│  "Serverless functions execute in milliseconds without..."
└─

┌─ ID: ghi-789
│  "Unlike traditional serverless platforms, Workers..."
└─
```

## API Endpoints

### Create New Conversation
```bash
POST /chat/conversations
```
**Response**: `{ "id": "uuid" }`

### Send Message
```bash
POST /chat/conversations/{id}/messages
Content-Type: application/json

{"message": "Your question here"}
```

**Response**:
```json
{
  "role": "assistant",
  "content": "Response text...",
  "sources": [
    {"id": "note-id", "text": "relevant excerpt"},
    {"id": "note-id", "text": "relevant excerpt"}
  ]
}
```

### Load Conversation History
```bash
GET /chat/conversations/{id}
```

**Response**:
```json
[
  {
    "role": "user",
    "content": "What is...",
    "sources": null
  },
  {
    "role": "assistant",
    "content": "Answer...",
    "sources": [...]
  }
]
```

## System Prompt (RAG Constraints)

The system prompt sent to the AI model includes:

```
You are a helpful AI assistant that answers questions based ONLY
on the information provided in the retrieved documents.

IMPORTANT RULES:
1. You must ONLY use information from the "Retrieved Documents" section
2. If documents don't contain info to answer, say "I don't have enough information..."
3. When citing, include document ID like this: [ID: <id>]
4. Do NOT use external knowledge or make assumptions
5. Be concise and factual

Retrieved Documents:
[1] (ID: abc-123)
Document content here...

[2] (ID: def-456)
More document content...
```

## Tips for Best Results

### Document Preparation
1. **Clear Structure**: Use headings, bullet points, sections
2. **Complete Sentences**: Avoid fragments that lose context
3. **Metadata**: Add title, author, tags for better organization
4. **Size**: Optimal chunk size ~1000 tokens (enable text splitting)

### Asking Questions
1. **Specific**: "What are the pricing tiers?" vs "Tell me about pricing"
2. **Context**: Reference document topics if available
3. **Follow-ups**: Chat remembers previous messages, use that
4. **Fallback Ready**: System will say if answer not in documents

### Production Usage
1. **Set ANTHROPIC_API_KEY** for better RAG performance
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```
2. **Enable Text Splitting** in wrangler.jsonc for large documents
   ```json
   "vars": {
     "ENABLE_TEXT_SPLITTING": true
   }
   ```
3. **Test with Documents** before deploying
4. **Monitor** conversation quality, adjust system prompt if needed

## Troubleshooting

### Messages Not Saving
- Check browser console for errors (F12)
- Verify D1 database migrations applied: `wrangler d1 migrations apply DATABASE`
- Check logs: `wrangler tail`

### No Sources Shown
- Verify documents uploaded and indexed
- Check document content matches question topics
- Vector search needs semantic overlap (~20-30% similarity threshold)

### Generic/Unhelpful Responses
- Document content may not address question
- Try adding more relevant documents
- Rephrase question with document terminology
- Check system prompt hasn't been weakened

### Performance Issues
- Vector search: Vectorize queries are usually <100ms
- Embedding generation: First request slower (cold start)
- AI Response: Depends on model (Claude faster than Llama)

## Database Schema

### Conversations Table
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'user' or 'assistant'
  content TEXT NOT NULL,        -- message text
  sources TEXT,                 -- JSON array of source objects
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE CASCADE
);
```

**Indexes** for performance:
```sql
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

## Security Considerations

### Input Validation
- Messages validated for non-empty content
- Conversation IDs are UUIDs (can't guess)
- No SQL injection: Using parameterized queries

### Output Safety
- System prompt prevents external knowledge (no arbitrary commands)
- Sources limited to retrieved documents (no internal data leak)
- No user data exposure in responses

### Future Security
- Add authentication for multi-user scenarios
- Rate limiting per user/IP
- Audit logging for compliance
- Encrypted sensitive metadata

## Advanced Configuration

### Adjust Vector Search
Edit `src/index.ts` line 229:
```typescript
const vectorQuery = await c.env.VECTOR_INDEX.query(vectors, {
  topK: 3,  // Change from 3 to 5 for more context
  returnMetadata: true
});
```

### Customize System Prompt
Edit `src/index.ts` lines 246-255:
```typescript
const systemPrompt = `You are a helpful AI assistant...`;
```

### Change AI Model
Set in wrangler.jsonc:
```jsonc
{
  "vars": {
    "ANTHROPIC_MODEL": "claude-3-5-sonnet-latest"
  }
}
```

## Next Steps

### Extend Chat Feature
- [ ] Add conversation titles (auto-generated)
- [ ] Implement conversation search
- [ ] Add export to PDF/Markdown
- [ ] Create conversation sharing (read-only)
- [ ] Build admin dashboard for analytics

### Improve RAG Quality
- [ ] Add source ranking by relevance
- [ ] Implement follow-up question suggestions
- [ ] Add user feedback loop
- [ ] Create conversation ratings

### Production Readiness
- [ ] Add authentication layer
- [ ] Implement rate limiting
- [ ] Set up monitoring/alerts
- [ ] Create backup strategy for D1

## Support

For issues or questions:
1. Check `CHAT_FEATURE_VALIDATION.md` for detailed implementation info
2. Review error messages in browser console (F12)
3. Check `wrangler tail` for server logs
4. See `CLAUDE.md` for architecture documentation

## Files Reference

- **Frontend**: `src/chat.html` (UI & JavaScript)
- **Backend**: `src/index.ts` lines 174-327 (Chat endpoints)
- **Database**: `migrations/0003_create_chat_tables.sql` (Schema)
- **Types**: `src/types/index.ts` (TypeScript definitions)
- **Utilities**: `src/utils/logger.ts`, `src/utils/document-store.ts`
