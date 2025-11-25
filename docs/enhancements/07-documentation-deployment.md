# Enhancement 7: Documentation & Deployment

**Priority:** Medium
**Estimated Effort:** Small-Medium
**Dependencies:** Other enhancements (documents their features)

## Overview

Update documentation for chat feature, implement feature flags for safe rollout, and establish deployment procedures.

## Objectives

- Keep documentation accurate and complete
- Enable safe feature rollouts with flags
- Document deployment and rollback procedures
- Provide troubleshooting guidance

## Current State

✅ **Already Implemented:**
- Basic CLAUDE.md with project overview
- Database migration (migrations/0002_create_chat_tables.sql)

❌ **Not Implemented:**
- Chat feature documentation
- Feature flags
- Troubleshooting guide
- Deployment procedures
- Rollback strategy

## Implementation Tasks

### 1. README Updates

**Add Chat Feature Section:**

```markdown
## Chat Feature

The application includes an interactive chat interface at `/chat` with:

- **Conversation Persistence**: Conversations and messages stored in D1
- **RAG Integration**: Each query retrieves top 3 relevant documents
- **Document-Constrained Responses**: AI only uses retrieved documents
- **Source Citations**: Responses include document references
- **Conversation Memory**: Full context maintained across messages
- **Dual Model Support**: Anthropic Claude or Workers AI

### Chat API Endpoints

#### Create Conversation
```
POST /chat/conversations
```
Creates a new conversation and returns its ID.

#### Get Conversation History
```
GET /chat/conversations/:id
```
Returns all messages in the conversation.

#### Send Message
```
POST /chat/conversations/:id/messages
Content-Type: application/json

{
  "message": "Your question here"
}
```
Sends a message and receives AI response with sources.

### Chat Configuration

Environment variables in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    // Chat behavior
    "MAX_CHAT_HISTORY": "12",           // Max messages to keep in context
    "MAX_MESSAGE_LENGTH": "10000",      // Max characters per message
    "MIN_SIMILARITY": "0.65",           // Minimum retrieval similarity

    // Feature flags
    "ENABLE_CHAT_SUMMARIZATION": "false",
    "ENABLE_CITATION_VALIDATION": "true",
    "ENABLE_PROMPT_INJECTION_PROTECTION": "true"
  }
}
```

### Citation Format

Responses include citations like:
- `[ID: abc123]` - References document ID abc123
- Invalid citations are automatically removed

### Conversation Summarization

When enabled, conversations exceeding `MAX_CHAT_HISTORY` messages
are automatically summarized to maintain context while controlling
token usage.
```

**Tasks:**
- [ ] Add Chat Feature section to README
- [ ] Document all API endpoints with examples
- [ ] List all environment variables
- [ ] Document citation format
- [ ] Explain summarization behavior (when implemented)
- [ ] Add architecture diagram (optional)

### 2. Troubleshooting Guide

**Create:** `docs/TROUBLESHOOTING.md`

```markdown
# Chat Feature Troubleshooting

## Rate Limiting (429 Responses)

**Symptom:** Getting "Rate limit exceeded" errors

**Causes:**
- Exceeded 30 requests per minute per IP
- Flood protection triggered (> 5 messages in < 10 seconds)

**Solutions:**
1. Wait for the time specified in `Retry-After` header
2. Reduce request frequency
3. For testing, adjust rate limits in wrangler.jsonc

## Low Similarity / Insufficient Context

**Symptom:** AI responds "I don't have enough information..."

**Causes:**
- No documents in knowledge base match query
- Similarity scores below MIN_SIMILARITY threshold
- Query too vague or off-topic

**Solutions:**
1. Rephrase question to be more specific
2. Add more relevant documents to knowledge base
3. Adjust MIN_SIMILARITY threshold (default: 0.65)

## Circuit Breaker Activated

**Symptom:** Receiving fallback responses instead of AI-generated content

**Causes:**
- Multiple consecutive AI service failures
- Circuit breaker opened to prevent cascade failures

**Solutions:**
1. Wait 30 seconds for circuit to reset
2. Check AI service status (Anthropic or Workers AI)
3. Review logs for underlying errors
4. Circuit auto-recovers when service stabilizes

## Invalid or Missing Citations

**Symptom:** Citations removed or missing from responses

**Causes:**
- AI hallucinated non-existent document IDs
- Citation validation removed invalid references

**Causes:**
- This is expected behavior (citation validation working)
- Check logs for citation validation warnings
- If persistent, may indicate AI model issues

## Message Not Saved

**Symptom:** 500 error when sending message

**Causes:**
- Database connection issues
- Message exceeds size limits
- Conversation doesn't exist

**Solutions:**
1. Verify conversation ID is valid
2. Check message length < 10,000 characters
3. Review database logs for errors
4. Ensure D1 database is accessible

## Performance Issues

**Symptom:** Slow response times (> 3 seconds)

**Causes:**
- Large conversation history
- Complex RAG retrieval
- AI service latency
- Database query performance

**Solutions:**
1. Check metrics logs for slow phases
2. Verify database indexes are present
3. Consider reducing MAX_CHAT_HISTORY
4. Review p95 latency metrics
5. Check external service status
```

**Tasks:**
- [ ] Create TROUBLESHOOTING.md
- [ ] Document common issues and solutions
- [ ] Add diagnostic steps
- [ ] Include log examples
- [ ] Reference configuration options

### 3. Feature Flags Implementation

```typescript
// Feature flag helpers
function isFeatureEnabled(c: Context, flagName: string): boolean {
  const value = c.env[flagName];
  return value === 'true' || value === true;
}

// Usage in code
if (isFeatureEnabled(c, 'ENABLE_CITATION_VALIDATION')) {
  // Validate citations
}

if (isFeatureEnabled(c, 'ENABLE_CHAT_SUMMARIZATION')) {
  // Apply conversation window with summarization
}

if (isFeatureEnabled(c, 'ENABLE_PROMPT_INJECTION_PROTECTION')) {
  // Check for injection attempts
}
```

**Feature Flags to Add:**

```jsonc
// In wrangler.jsonc
{
  "vars": {
    // Feature flags - can be toggled without code changes
    "ENABLE_CHAT_SUMMARIZATION": "false",
    "ENABLE_CITATION_VALIDATION": "true",
    "ENABLE_PROMPT_INJECTION_PROTECTION": "true",
    "ENABLE_EMBEDDING_CACHE": "false",
    "ENABLE_CIRCUIT_BREAKER": "true",
    "ENABLE_ADAPTIVE_TOPK": "false"
  }
}
```

**Tasks:**
- [ ] Add feature flag checks in code
- [ ] Document all flags in wrangler.jsonc
- [ ] Test each flag can be toggled
- [ ] Verify graceful degradation when disabled
- [ ] Add flag status to logs

### 4. Deployment Procedures

**Create:** `docs/DEPLOYMENT.md`

```markdown
# Deployment Procedures

## Pre-Deployment Checklist

- [ ] All tests passing (`npm test`)
- [ ] Code reviewed and approved
- [ ] Database migrations tested locally
- [ ] Feature flags configured appropriately
- [ ] Performance benchmarks acceptable
- [ ] Documentation updated

## Deployment Steps

### 1. Database Migrations

```bash
# Apply migrations locally first (testing)
wrangler d1 migrations apply DATABASE

# Verify migration success
wrangler d1 execute DATABASE --command="SELECT name FROM sqlite_master WHERE type='table'"

# Apply to production
wrangler d1 migrations apply DATABASE --remote
```

### 2. Deploy Code

```bash
# Deploy to production
npm run deploy

# Verify deployment
curl https://your-worker.workers.dev/
```

### 3. Staged Feature Enablement

Enable features incrementally to reduce risk:

```bash
# Stage 1: Deploy with all new features OFF
# (Already done in deployment)

# Stage 2: Enable citation validation (low risk)
# Update wrangler.jsonc:
# ENABLE_CITATION_VALIDATION=true
wrangler deploy

# Wait 10 minutes, monitor logs for errors

# Stage 3: Enable circuit breaker (medium risk)
# ENABLE_CIRCUIT_BREAKER=true
wrangler deploy

# Wait 10 minutes, monitor logs

# Stage 4: Enable summarization (if ready)
# ENABLE_CHAT_SUMMARIZATION=true
wrangler deploy
```

### 4. Post-Deployment Verification

```bash
# Test chat creation
curl -X POST https://your-worker.workers.dev/chat/conversations

# Test message sending
curl -X POST https://your-worker.workers.dev/chat/conversations/{id}/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'

# Check logs
wrangler tail

# Monitor metrics
# - Check p95 latency
# - Check error rates
# - Verify feature flags active
```

## Rollback Procedures

### Quick Rollback (Disable Feature)

```bash
# Disable problematic feature via flag
# Edit wrangler.jsonc, set flag to "false"
wrangler deploy

# Verify feature disabled in logs
wrangler tail
```

### Full Rollback (Previous Version)

```bash
# Rollback to previous deployment
wrangler rollback

# Or deploy specific version
git checkout <previous-commit>
wrangler deploy
```

### Database Rollback

⚠️ **WARNING**: Database rollbacks are destructive

```bash
# Only if absolutely necessary
# Manually run reverse migration SQL
wrangler d1 execute DATABASE --command="
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS conversations;
"
```

## Monitoring Post-Deployment

Watch for:
- Error rate spikes
- Latency increases (p95 > 1500ms)
- Rate limit triggers
- Circuit breaker activations
- Citation validation warnings
- Database query performance

```bash
# Real-time logs
wrangler tail

# Filter for errors
wrangler tail | grep -i error

# Filter for specific feature
wrangler tail | grep citation
```
```

**Tasks:**
- [ ] Create DEPLOYMENT.md
- [ ] Document deployment steps
- [ ] Define staged rollout plan
- [ ] Document rollback procedures
- [ ] Add monitoring commands
- [ ] Create deployment checklist

### 5. Migration Strategy

**For Context Management (Summarization):**

```sql
-- Migration 0003: Add message_type support
ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'message';
CREATE INDEX idx_messages_type ON messages(conversation_id, message_type);
```

**Backfill Script:**

```typescript
// scripts/backfill-summaries.ts
async function backfillConversationSummaries(env: Env) {
  const MAX_HISTORY = 12;

  // Get all conversations
  const { results: conversations } = await env.DATABASE
    .prepare('SELECT DISTINCT conversation_id FROM messages')
    .all();

  for (const conv of conversations) {
    const { results: messages } = await env.DATABASE
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .bind(conv.conversation_id)
      .all<Message>();

    if (messages.length > MAX_HISTORY) {
      console.log(`Conversation ${conv.conversation_id} has ${messages.length} messages, needs summarization`);

      // Generate and store summary
      // Delete old messages
      // (Implementation per Enhancement 3)
    }
  }
}
```

**Tasks:**
- [ ] Create migration for new features
- [ ] Write backfill scripts if needed
- [ ] Test migrations locally
- [ ] Test backfill on copy of production data
- [ ] Document migration sequence

## Verification Criteria

- [ ] README contains complete chat documentation
- [ ] All environment variables documented
- [ ] TROUBLESHOOTING.md covers common issues
- [ ] DEPLOYMENT.md has clear procedures
- [ ] Feature flags implemented and documented
- [ ] Flags can be toggled without redeployment (via wrangler.jsonc update)
- [ ] Rollback procedures tested
- [ ] Migration scripts tested
- [ ] Backfill procedures verified (if applicable)

## Documentation Checklist

Complete documentation should include:

- [ ] Feature overview and capabilities
- [ ] API endpoint documentation with examples
- [ ] Configuration options and defaults
- [ ] Environment variable reference
- [ ] Citation format explanation
- [ ] Troubleshooting guide
- [ ] Deployment procedures
- [ ] Rollback strategy
- [ ] Migration guide
- [ ] Performance expectations
- [ ] Security considerations
- [ ] Testing procedures

## References

- Remediation Plan: Domain K (Documentation Updates)
- Remediation Plan: Domain I (Rollback Strategy)
- Remediation Plan: Domain L (Deployment & Migration)
- Existing migration: migrations/0002_create_chat_tables.sql
- Project docs: CLAUDE.md, README.md
