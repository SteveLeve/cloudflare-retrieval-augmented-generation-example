# Enhancement 4: Reliability & Error Handling

**Priority:** High
**Estimated Effort:** Medium
**Dependencies:** None

## Overview

Implement comprehensive error handling, retry logic, circuit breakers, and concurrency protections to improve system resilience.

## Objectives

- Graceful degradation on transient failures
- Prevent race conditions under concurrent requests
- Implement retry and fallback strategies
- Add circuit breaker for external service failures

## Current State

✅ **Already Implemented:**
- Basic error handling in some paths
- Database validation (conversation exists check, line 285)

❌ **Not Implemented:**
- AI call retries
- Circuit breaker pattern
- Fallback responses
- Concurrency safeguards
- Comprehensive error handling

## Implementation Tasks

### 1. AI Call Retries with Exponential Backoff

```typescript
async function callAIWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  operationName: string = 'AI operation'
): Promise<T> {
  const delays = [200, 400];  // ms
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = delays[attempt];
        logger.warn(`${operationName} failed, retrying`, {
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: lastError.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
}

// Usage
const response = await callAIWithRetry(
  () => anthropic.messages.create({...}),
  2,
  'Anthropic message generation'
);
```

**Tasks:**
- [ ] Implement retry wrapper function
- [ ] Apply to all AI calls (Anthropic and Workers AI)
- [ ] Add retry logging
- [ ] Test with simulated failures
- [ ] Configure max retries via environment variable

### 2. Circuit Breaker Pattern

```typescript
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed'
  };

  private readonly failureThreshold = 5;
  private readonly windowMs = 2 * 60 * 1000;  // 2 minutes
  private readonly cooldownMs = 30 * 1000;    // 30 seconds

  async execute<T>(
    operation: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    // Check if circuit is open
    if (this.state.state === 'open') {
      const timeSinceFailure = Date.now() - this.state.lastFailureTime;

      if (timeSinceFailure < this.cooldownMs) {
        logger.warn('Circuit breaker open, using fallback');
        return fallback();
      }

      // Try half-open state
      this.state.state = 'half-open';
      logger.info('Circuit breaker entering half-open state');
    }

    try {
      const result = await operation();

      // Success - reset or close circuit
      if (this.state.state === 'half-open') {
        this.state.state = 'closed';
        this.state.failures = 0;
        logger.info('Circuit breaker closed after successful operation');
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    const now = Date.now();

    // Reset window if outside failure window
    if (now - this.state.lastFailureTime > this.windowMs) {
      this.state.failures = 0;
    }

    this.state.failures++;
    this.state.lastFailureTime = now;

    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'open';
      logger.error('Circuit breaker opened', {
        failures: this.state.failures,
        threshold: this.failureThreshold
      });
    }
  }

  getState(): string {
    return this.state.state;
  }
}

// Create circuit breaker instances
const aiCircuitBreaker = new CircuitBreaker();
```

**Tasks:**
- [ ] Implement CircuitBreaker class
- [ ] Create breaker instances for AI services
- [ ] Define fallback response templates
- [ ] Add circuit state logging
- [ ] Test circuit opening/closing behavior
- [ ] Monitor circuit state in production

### 3. Fallback Response Templates

```typescript
function createFallbackResponse(
  retrievedNotes: Note[],
  userMessage: string
): string {
  if (retrievedNotes.length === 0) {
    return "I apologize, but I'm currently unable to generate a response. No relevant documents were found for your query. Please try rephrasing your question or try again later.";
  }

  // Return context-only response
  const sources = retrievedNotes
    .map((note, idx) => `[${idx + 1}] ${note.text}`)
    .join('\n\n');

  return `I apologize, but I'm currently unable to generate a detailed response. However, I found these potentially relevant documents:\n\n${sources}\n\nPlease review these sources or try your question again later.`;
}

// Usage in chat endpoint
try {
  assistantMessage = await aiCircuitBreaker.execute(
    () => callAIWithRetry(() => generateAIResponse(...)),
    () => createFallbackResponse(retrievedNotes, message)
  );
} catch (error) {
  assistantMessage = createFallbackResponse(retrievedNotes, message);
  logger.error('AI generation failed completely', error);
}
```

**Tasks:**
- [ ] Create fallback template function
- [ ] Integrate with circuit breaker
- [ ] Test fallback responses
- [ ] Ensure fallback includes retrieved context when available

### 4. Vector Search Retry

```typescript
async function queryVectorIndexWithRetry(
  index: VectorizeIndex,
  vectors: number[],
  options: VectorizeQueryOptions
): Promise<VectorizeMatches> {
  try {
    return await index.query(vectors, options);
  } catch (error) {
    logger.warn('Vector search failed, retrying once', { error });

    // Single retry after brief delay
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      return await index.query(vectors, options);
    } catch (retryError) {
      logger.error('Vector search failed after retry', { retryError });

      // Return empty results rather than crashing
      return { matches: [] };
    }
  }
}
```

**Tasks:**
- [ ] Implement vector search retry
- [ ] Return empty matches on total failure
- [ ] Log retry attempts
- [ ] Test with simulated failures

### 5. Idempotent Message Inserts

```typescript
// Generate deterministic IDs based on conversation + content + time bucket
function generateIdempotentMessageId(
  conversationId: string,
  content: string,
  role: string
): string {
  // Use time bucket (rounded to 10 seconds) to allow retries within window
  const timeBucket = Math.floor(Date.now() / 10000) * 10000;

  // Create deterministic hash
  const input = `${conversationId}:${role}:${content}:${timeBucket}`;

  // Simple hash (in production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `msg_${Math.abs(hash).toString(36)}`;
}

// Usage
const userMessageId = generateIdempotentMessageId(
  conversationId,
  message,
  'user'
);

// Database will reject duplicate IDs, preventing race conditions
```

**Tasks:**
- [ ] Implement deterministic ID generation
- [ ] Use for message inserts
- [ ] Handle duplicate key errors gracefully
- [ ] Test with concurrent requests

### 6. Conversation-Level Mutex

```typescript
// Simple in-memory mutex for conversation operations
const conversationLocks = new Map<string, Promise<void>>();
const LOCK_TIMEOUT = 30000;  // 30 seconds

async function withConversationLock<T>(
  conversationId: string,
  operation: () => Promise<T>
): Promise<T> {
  // Wait for existing operation to complete
  const existingLock = conversationLocks.get(conversationId);
  if (existingLock) {
    await Promise.race([
      existingLock,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Lock timeout')), LOCK_TIMEOUT)
      )
    ]);
  }

  // Create new lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>(resolve => {
    releaseLock = resolve;
  });

  conversationLocks.set(conversationId, lockPromise);

  try {
    return await operation();
  } finally {
    releaseLock!();
    conversationLocks.delete(conversationId);
  }
}

// Usage in chat endpoint
return await withConversationLock(conversationId, async () => {
  // All chat message processing here
  // ...
});
```

**Tasks:**
- [ ] Implement conversation lock mechanism
- [ ] Apply to chat message endpoint
- [ ] Handle lock timeout errors
- [ ] Test with concurrent requests to same conversation
- [ ] Consider using Durable Objects for distributed locking

### 7. Comprehensive Error Handling

```typescript
// Wrap entire chat endpoint in try-catch
app.post('/chat/conversations/:id/messages', async (c) => {
  const logger = createLogger({
    endpoint: 'POST /chat/conversations/:id/messages'
  });

  try {
    // ... all processing
  } catch (error) {
    logger.error('Chat message processing failed', error instanceof Error ? error : new Error(String(error)));

    // Return appropriate error based on type
    if (error instanceof Error) {
      if (error.message.includes('Conversation not found')) {
        return c.text('Conversation not found', 404);
      }
      if (error.message.includes('Rate limit')) {
        return c.text('Rate limit exceeded', 429);
      }
    }

    // Generic error for unknown failures
    return c.text('An error occurred while processing your message. Please try again.', 500);
  }
});
```

**Tasks:**
- [ ] Add comprehensive try-catch to all endpoints
- [ ] Classify errors for appropriate status codes
- [ ] Log all errors with context
- [ ] Return safe error messages to users
- [ ] Test error handling paths

## Verification Criteria

- [ ] Induced transient AI error triggers retry logs
- [ ] AI call succeeds after retry
- [ ] Circuit breaker activates after 5 forced failures
- [ ] Circuit breaker provides fallback response when open
- [ ] Circuit breaker closes after cooldown + successful call
- [ ] Fallback response contains context template
- [ ] Vector search retry works on transient failure
- [ ] Parallel POSTs to same conversation handled correctly
- [ ] No duplicate messages from concurrent requests
- [ ] Lock timeout prevents indefinite waits
- [ ] All error types handled gracefully

## Configuration

Environment variables:
- `AI_MAX_RETRIES` - Max retry attempts (default: 2)
- `CIRCUIT_BREAKER_THRESHOLD` - Failures to open circuit (default: 5)
- `CIRCUIT_BREAKER_COOLDOWN_MS` - Cooldown period (default: 30000)

## References

- Remediation Plan: Domain F (Error Handling & Resilience)
- Remediation Plan: Domain E (Concurrency & Race Conditions)
