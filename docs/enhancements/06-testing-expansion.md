# Enhancement 6: Testing Expansion

**Priority:** Medium
**Estimated Effort:** Medium-Large
**Dependencies:** None

## Overview

Add comprehensive test coverage for negative cases, edge cases, and critical chat functionality.

## Objectives

- Cover negative and edge cases
- Add integration tests for critical paths
- Implement load testing for concurrency
- Ensure test coverage for all major features

## Current State

✅ **Already Implemented:**
- Project has test infrastructure (vitest likely based on modern TS setup)
- parseSourcesSafely helper function (src/index.ts:55-65)

❌ **Not Implemented:**
- Unit tests for chat functions
- Integration tests for chat flow
- Load tests for concurrency
- Edge case coverage

## Implementation Tasks

### 1. Unit Tests

**Test File:** `src/__tests__/chat.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseSourcesSafely } from '../index';

describe('parseSourcesSafely', () => {
  it('should parse valid JSON sources', () => {
    const sources = JSON.stringify([
      { id: '123', text: 'test' }
    ]);

    const result = parseSourcesSafely(sources);

    expect(result).toEqual([{ id: '123', text: 'test' }]);
  });

  it('should return undefined for null input', () => {
    expect(parseSourcesSafely(null)).toBeUndefined();
  });

  it('should return undefined for invalid JSON', () => {
    const invalid = '{invalid json}';
    expect(parseSourcesSafely(invalid)).toBeUndefined();
  });

  it('should log error for invalid JSON when logger provided', () => {
    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    };

    parseSourcesSafely('{invalid}', mockLogger as any);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to parse sources JSON',
      expect.any(Error)
    );
  });
});
```

**Tasks:**
- [ ] Create test file for chat utilities
- [ ] Test parseSourcesSafely function
- [ ] Test input validation functions (when created)
- [ ] Test citation extraction (when created)
- [ ] Test token estimation (when created)
- [ ] Test rate limiting logic

### 2. Integration Tests

**Test File:** `src/__tests__/chat-integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('Chat Integration Tests', () => {
  let worker: any;

  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true }
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  it('should create a new conversation', async () => {
    const resp = await worker.fetch('/chat/conversations', {
      method: 'POST'
    });

    expect(resp.status).toBe(200);

    const data = await resp.json();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('created_at');
  });

  it('should send message and receive response', async () => {
    // Create conversation
    const createResp = await worker.fetch('/chat/conversations', {
      method: 'POST'
    });
    const { id } = await createResp.json();

    // Send message
    const msgResp = await worker.fetch(`/chat/conversations/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello, test message' })
    });

    expect(msgResp.status).toBe(200);

    const data = await msgResp.json();
    expect(data).toHaveProperty('role', 'assistant');
    expect(data).toHaveProperty('content');
  });

  it('should return 404 for non-existent conversation', async () => {
    const resp = await worker.fetch('/chat/conversations/invalid-id/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' })
    });

    expect(resp.status).toBe(404);
  });

  it('should return 400 for missing message', async () => {
    const createResp = await worker.fetch('/chat/conversations', {
      method: 'POST'
    });
    const { id } = await createResp.json();

    const resp = await worker.fetch(`/chat/conversations/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(resp.status).toBe(400);
  });

  it('should return 400 for oversize message', async () => {
    const createResp = await worker.fetch('/chat/conversations', {
      method: 'POST'
    });
    const { id } = await createResp.json();

    const longMessage = 'x'.repeat(11000);

    const resp = await worker.fetch(`/chat/conversations/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: longMessage })
    });

    expect(resp.status).toBe(400);
  });
});
```

**Tasks:**
- [ ] Create integration test file
- [ ] Test conversation creation flow
- [ ] Test message send/receive flow
- [ ] Test multi-turn conversations
- [ ] Test RAG retrieval integration
- [ ] Test both AI provider paths (Anthropic and Workers AI)

### 3. Edge Case Tests

```typescript
describe('Edge Cases', () => {
  it('should handle empty conversation history', async () => {
    // First message in new conversation
    // Verify no errors with empty history
  });

  it('should handle concurrent messages to same conversation', async () => {
    // Send multiple messages simultaneously
    // Verify all are processed correctly
    // Verify no duplicates
  });

  it('should handle RAG with no matching documents', async () => {
    // Send message unlikely to match any docs
    // Verify graceful handling
  });

  it('should handle very long conversation history', async () => {
    // Create conversation with many messages
    // Verify performance acceptable
    // Verify summarization triggers (if implemented)
  });

  it('should handle special characters in messages', async () => {
    const specialChars = 'Test with émoji 🎉 and <html> & special chars';
    // Verify proper handling and storage
  });
});
```

**Tasks:**
- [ ] Test empty history scenario
- [ ] Test concurrent requests
- [ ] Test no RAG matches
- [ ] Test long conversations
- [ ] Test special characters

### 4. Load Testing

**Load Test Script:** `tests/load/chat-load-test.ts`

```typescript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests under 1.5s
    errors: ['rate<0.1'],               // Error rate under 10%
  },
};

const BASE_URL = 'http://localhost:8787';

export default function () {
  // Create conversation
  const createResp = http.post(`${BASE_URL}/chat/conversations`);

  const createCheck = check(createResp, {
    'conversation created': (r) => r.status === 200,
  });

  if (!createCheck) {
    errorRate.add(1);
    return;
  }

  const { id } = createResp.json();

  // Send message
  const message = { message: 'What is the meaning of life?' };
  const msgResp = http.post(
    `${BASE_URL}/chat/conversations/${id}/messages`,
    JSON.stringify(message),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const msgCheck = check(msgResp, {
    'message sent successfully': (r) => r.status === 200,
    'response has content': (r) => r.json('content') !== undefined,
  });

  if (!msgCheck) {
    errorRate.add(1);
  }

  sleep(1);
}
```

**Alternative: Simple Node.js Load Test**

```typescript
// tests/load/simple-load-test.ts
async function runLoadTest() {
  const concurrency = 10;
  const requestsPerWorker = 10;
  const baseUrl = 'http://localhost:8787';

  const workers = Array.from({ length: concurrency }, async (_, i) => {
    const results = [];

    for (let j = 0; j < requestsPerWorker; j++) {
      const start = Date.now();

      try {
        // Create conversation
        const createResp = await fetch(`${baseUrl}/chat/conversations`, {
          method: 'POST'
        });
        const { id } = await createResp.json();

        // Send message
        const msgResp = await fetch(`${baseUrl}/chat/conversations/${id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Test message' })
        });

        const duration = Date.now() - start;

        results.push({
          worker: i,
          request: j,
          status: msgResp.status,
          duration
        });
      } catch (error) {
        results.push({
          worker: i,
          request: j,
          error: error.message,
          duration: Date.now() - start
        });
      }
    }

    return results;
  });

  const allResults = (await Promise.all(workers)).flat();

  // Calculate stats
  const durations = allResults
    .filter(r => !r.error)
    .map(r => r.duration)
    .sort((a, b) => a - b);

  console.log({
    total: allResults.length,
    successful: durations.length,
    failed: allResults.filter(r => r.error).length,
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
    max: durations[durations.length - 1]
  });
}
```

**Tasks:**
- [ ] Create load test script (k6 or simple Node.js)
- [ ] Test with increasing concurrency
- [ ] Test concurrent requests to different conversations
- [ ] Test concurrent requests to same conversation
- [ ] Measure latency distribution
- [ ] Verify rate limiting activates correctly
- [ ] Check for race conditions

### 5. Snapshot Tests

```typescript
describe('Snapshot Tests', () => {
  it('should match system prompt format', () => {
    const systemPrompt = generateSystemPrompt(['doc1', 'doc2']);
    expect(systemPrompt).toMatchSnapshot();
  });

  it('should match citation format', () => {
    const sources = [
      { id: '123', text: 'Source 1' },
      { id: '456', text: 'Source 2' }
    ];
    const formatted = formatCitations(sources);
    expect(formatted).toMatchSnapshot();
  });

  it('should match error response format', () => {
    const errorResp = formatErrorResponse('operation failed');
    expect(errorResp).toMatchSnapshot();
  });
});
```

**Tasks:**
- [ ] Create snapshot tests for templates
- [ ] Test system prompt consistency
- [ ] Test citation formatting
- [ ] Test error message formats

## Verification Criteria

- [ ] All new tests pass locally (`npm test`)
- [ ] Test coverage > 70% for chat features
- [ ] Load test shows consistent successful responses
- [ ] Load test confirms p95 latency < 1500ms
- [ ] No race conditions under concurrent load
- [ ] Edge cases handled gracefully
- [ ] Integration tests cover happy path and errors
- [ ] Snapshot tests prevent unintended format changes

## Test Infrastructure Setup

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:load": "node tests/load/simple-load-test.ts"
  }
}
```

**Tasks:**
- [ ] Verify vitest configuration
- [ ] Add test scripts to package.json
- [ ] Set up coverage reporting
- [ ] Document how to run tests

## References

- Remediation Plan: Domain J (Testing Expansion)
- Existing helper: parseSourcesSafely (src/index.ts:55-65)
