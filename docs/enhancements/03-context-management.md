# Enhancement 3: Context Management & Summarization

**Priority:** Medium
**Estimated Effort:** Medium
**Dependencies:** None

## Overview

Prevent unbounded token growth in long conversations by implementing sliding window context management with automatic summarization.

## Objectives

- Maintain conversation relevance while controlling token count
- Prevent context overflow with long chat sessions
- Implement configurable context window
- Generate summaries for older conversation context

## Current State

✅ **Already Implemented:**
- Basic history limiting: LIMIT 10 (line 290)
- History reversal for chronological order (line 292)

❌ **Not Implemented:**
- Configurable history limit
- Automatic summarization
- Token counting/estimation
- Summary storage and retrieval

## Implementation Tasks

### 1. Configurable History Limit

**Tasks:**
- [ ] Add `MAX_CHAT_HISTORY` environment variable (default: 12)
- [ ] Update history query to use configurable limit
- [ ] Document in wrangler.jsonc and README
- [ ] Test with various limit values

### 2. Token Estimation

```typescript
// Lightweight token estimation
function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English
  // More accurate: count words and multiply by 1.3
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 1.3);
}

function estimateConversationTokens(messages: Message[]): number {
  let total = 0;

  for (const msg of messages) {
    // Count message content
    total += estimateTokens(msg.content);

    // Add overhead for role and structure (~10 tokens per message)
    total += 10;
  }

  return total;
}
```

**Tasks:**
- [ ] Implement token estimation functions
- [ ] Test accuracy against actual token counts
- [ ] Add token count logging
- [ ] Define token thresholds (e.g., 6000 for 8k models)

### 3. Automatic Summarization

```typescript
// Database schema addition
// ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'message';
// Valid types: 'message', 'summary'

async function generateConversationSummary(
  messages: Message[],
  env: Env
): Promise<string> {
  // Build messages for summary generation
  const summaryMessages = messages.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }));

  const summaryPrompt = `Summarize the key points and context from this conversation. Include:
- Main topics discussed
- Important decisions or conclusions
- Key facts or information shared
- Any ongoing questions or open items

Be concise but comprehensive. This summary will be used to maintain context for future conversation turns.`;

  // Generate summary using AI
  let summary: string;

  if (env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      max_tokens: 500,
      model: 'claude-3-5-sonnet-latest',
      messages: summaryMessages,
      system: summaryPrompt
    });
    summary = (response.content as TextBlock[]).map(c => c.text).join('\n');
  } else {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: summaryPrompt },
        ...summaryMessages
      ]
    }) as AiTextGenerationOutput;
    summary = response.response || '';
  }

  return summary;
}
```

**Tasks:**
- [ ] Add `message_type` column to messages table
- [ ] Create migration for schema change
- [ ] Implement summary generation function
- [ ] Test summary quality with different conversation lengths
- [ ] Handle AI failures during summarization

### 4. Summary Storage and Replacement

```typescript
async function applyConversationWindow(
  conversationId: string,
  messages: Message[],
  maxHistory: number,
  env: Env,
  db: D1Database
): Promise<Message[]> {
  // If under limit, return as-is
  if (messages.length <= maxHistory) {
    return messages;
  }

  // Check if we already have a summary
  const existingSummary = messages.find(m => m.message_type === 'summary');

  if (existingSummary) {
    // Already have summary, just keep last maxHistory messages plus summary
    const summary = messages.filter(m => m.message_type === 'summary')[0];
    const recent = messages
      .filter(m => m.message_type === 'message')
      .slice(-maxHistory);

    return [summary, ...recent];
  }

  // Need to create summary
  const messagesToSummarize = messages.slice(0, -maxHistory);
  const recentMessages = messages.slice(-maxHistory);

  // Generate summary
  const summaryText = await generateConversationSummary(messagesToSummarize, env);

  // Store summary in database
  const summaryId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, sources, message_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(summaryId, conversationId, 'system', summaryText, null, 'summary').run();

  // Delete old messages that were summarized
  const oldMessageIds = messagesToSummarize.map(m => m.id);
  if (oldMessageIds.length > 0) {
    const placeholders = oldMessageIds.map(() => '?').join(',');
    await db.prepare(`
      DELETE FROM messages
      WHERE id IN (${placeholders}) AND message_type = 'message'
    `).bind(...oldMessageIds).run();
  }

  // Return summary + recent messages
  const summary: Message = {
    id: summaryId,
    conversation_id: conversationId,
    role: 'system',
    content: summaryText,
    sources: null,
    created_at: Math.floor(Date.now() / 1000),
    message_type: 'summary'
  };

  return [summary, ...recentMessages];
}
```

**Tasks:**
- [ ] Implement conversation window management
- [ ] Apply before sending to AI
- [ ] Handle summary creation failures
- [ ] Test with conversations exceeding limit
- [ ] Verify summary quality maintains context

### 5. Integration with Chat Endpoint

```typescript
// In chat endpoint, after retrieving history
const maxHistory = parseInt(c.env.MAX_CHAT_HISTORY || '12', 10);
const estimatedTokens = estimateConversationTokens(history);

// Early summarization if approaching token limit
const tokenThreshold = 6000;  // For 8k context models
let processedHistory = history;

if (estimatedTokens > tokenThreshold || history.length > maxHistory) {
  processedHistory = await applyConversationWindow(
    conversationId,
    history,
    maxHistory,
    c.env,
    c.env.DATABASE
  );
}

// Use processedHistory for building conversation messages
const conversationMessages = processedHistory.map(msg => ({
  role: msg.role as 'user' | 'assistant' | 'system',
  content: msg.content
}));
```

**Tasks:**
- [ ] Integrate window management into chat endpoint
- [ ] Add token threshold check
- [ ] Update message mapping to include 'system' role for summaries
- [ ] Log when summarization occurs
- [ ] Monitor summary trigger frequency

## Database Migration

```sql
-- Migration number: 0003 [timestamp]

-- Add message_type column to messages table
ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'message';

-- Create index for efficient summary queries
CREATE INDEX idx_messages_type ON messages(conversation_id, message_type);
```

## Verification Criteria

- [ ] Conversation with > maxHistory turns triggers summarization
- [ ] Summary stored with message_type = 'summary'
- [ ] Old messages deleted after summarization
- [ ] Summary + recent messages <= maxHistory + 1
- [ ] Summary contains key entities from earlier turns (manual spot check)
- [ ] Token estimation triggers early summarization
- [ ] Conversations under limit not summarized
- [ ] New conversations start fresh (no stale summaries)
- [ ] Summary generation failures handled gracefully

## Configuration

Environment variables:
- `MAX_CHAT_HISTORY` - Maximum message count (default: 12)
- `CHAT_TOKEN_THRESHOLD` - Token count for early summarization (default: 6000)

## Edge Cases to Handle

1. **Summary generation fails**: Keep full history, log error
2. **Very first message**: No summarization needed
3. **Exactly at limit**: Don't trigger summary yet
4. **Multiple rapid messages**: Batch summarization
5. **Database transaction failures**: Rollback, keep full history

## References

- Remediation Plan: Domain B (Context Management & Scaling)
- Current history query: src/index.ts:290-292
