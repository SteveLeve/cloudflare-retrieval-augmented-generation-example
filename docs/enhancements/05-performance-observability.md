# Enhancement 5: Performance & Observability

**Priority:** Medium
**Estimated Effort:** Small-Medium
**Dependencies:** None

## Overview

Implement comprehensive performance metrics and observability to measure and optimize chat latency.

## Objectives

- Measure and track latency across all phases
- Calculate and log performance percentiles
- Validate database index usage
- Identify performance bottlenecks

## Current State

✅ **Already Implemented:**
- Logger utility with timing support (src/utils/logger.ts)
- Basic logging in endpoints

❌ **Not Implemented:**
- Phase-by-phase timing metrics
- Percentile calculations
- Database performance validation
- Performance baselines

## Implementation Tasks

### 1. Detailed Timing Metrics

```typescript
// Enhanced metrics tracking
interface ChatMetrics {
  conversationId: string;
  messageId: string;
  phases: {
    validation: number;
    historyRetrieval: number;
    messageSave: number;
    embeddingGeneration: number;
    vectorSearch: number;
    documentRetrieval: number;
    aiGeneration: number;
    responseSave: number;
  };
  total: number;
}

// In chat endpoint
const metrics: Partial<ChatMetrics> = {
  conversationId,
  messageId: userMessageId,
  phases: {}
};

let phaseStart = Date.now();

// Validation
// ... validation code
metrics.phases.validation = Date.now() - phaseStart;

phaseStart = Date.now();
// History retrieval
// ... query history
metrics.phases.historyRetrieval = Date.now() - phaseStart;

// ... continue for all phases

metrics.total = Object.values(metrics.phases).reduce((a, b) => a + b, 0);
logger.info('Chat request metrics', metrics);
```

**Tasks:**
- [ ] Define ChatMetrics interface
- [ ] Add timing capture for all phases
- [ ] Log complete metrics for each request
- [ ] Create metrics analysis queries/scripts

### 2. Percentile Calculation

```typescript
// Rolling metrics tracker
class MetricsTracker {
  private recentMetrics: number[] = [];
  private readonly maxSize = 50;
  private requestCount = 0;

  recordMetric(value: number): void {
    this.recentMetrics.push(value);

    // Keep only last maxSize entries
    if (this.recentMetrics.length > this.maxSize) {
      this.recentMetrics.shift();
    }

    this.requestCount++;

    // Log percentiles every 10 requests
    if (this.requestCount % 10 === 0) {
      this.logPercentiles();
    }
  }

  private logPercentiles(): void {
    if (this.recentMetrics.length === 0) return;

    const sorted = [...this.recentMetrics].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);

    const p50 = sorted[p50Index];
    const p95 = sorted[p95Index];
    const max = sorted[sorted.length - 1];
    const min = sorted[0];

    logger.info('Performance percentiles', {
      sampleSize: sorted.length,
      p50,
      p95,
      min,
      max,
      requestCount: this.requestCount
    });

    // Alert if p95 exceeds threshold
    if (p95 > 1500) {
      logger.warn('p95 latency exceeds threshold', { p95, threshold: 1500 });
    }
  }

  getStats() {
    if (this.recentMetrics.length === 0) return null;

    const sorted = [...this.recentMetrics].sort((a, b) => a - b);
    return {
      count: sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: sorted[sorted.length - 1],
      min: sorted[0]
    };
  }
}

// Create tracker instances
const totalLatencyTracker = new MetricsTracker();
const embeddingLatencyTracker = new MetricsTracker();
const aiLatencyTracker = new MetricsTracker();

// Record metrics
totalLatencyTracker.recordMetric(metrics.total);
embeddingLatencyTracker.recordMetric(metrics.phases.embeddingGeneration);
aiLatencyTracker.recordMetric(metrics.phases.aiGeneration);
```

**Tasks:**
- [ ] Implement MetricsTracker class
- [ ] Create tracker instances for key metrics
- [ ] Record metrics for all requests
- [ ] Log percentiles automatically
- [ ] Add alerting for p95 threshold violations

### 3. Database Performance Validation

```sql
-- Verify index usage on messages queries
EXPLAIN QUERY PLAN
SELECT * FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC
LIMIT 10;

-- Expected output should show index usage:
-- SEARCH TABLE messages USING INDEX idx_messages_conversation_created

-- Check if indexes exist
SELECT name, tbl_name, sql
FROM sqlite_master
WHERE type = 'index' AND tbl_name = 'messages';
```

**Tasks:**
- [ ] Run EXPLAIN on all message queries
- [ ] Verify conversation_id index usage
- [ ] Check created_at ordering performance
- [ ] Document findings in performance doc
- [ ] Create indexes if missing

### 4. Request ID Tracking

```typescript
// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Add to logger context
const logger = createLogger({
  endpoint: 'POST /chat/conversations/:id/messages',
  requestId: generateRequestId(),
  conversationId
});

// Include in all logs
logger.info('Processing chat message', { messageLength: message.length });
```

**Tasks:**
- [ ] Implement request ID generation
- [ ] Add to logger context
- [ ] Include in all log messages
- [ ] Use for distributed tracing

### 5. Conversation-Level Metrics

```typescript
// Log aggregate conversation metrics
interface ConversationMetrics {
  conversationId: string;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  avgRetrievalCount: number;
  avgResponseLength: number;
  modelsUsed: Set<string>;
}

function logConversationMetrics(
  conversationId: string,
  history: Message[],
  retrievedCount: number,
  responseLength: number,
  modelUsed: string
): void {
  const userMsgs = history.filter(m => m.role === 'user').length;
  const assistantMsgs = history.filter(m => m.role === 'assistant').length;

  logger.info('Conversation metrics', {
    conversationId,
    totalMessages: history.length,
    userMessages: userMsgs,
    assistantMessages: assistantMsgs,
    currentRetrievalCount: retrievedCount,
    currentResponseLength: responseLength,
    modelUsed
  });
}
```

**Tasks:**
- [ ] Implement conversation metrics logging
- [ ] Log after each message
- [ ] Track model usage patterns
- [ ] Analyze conversation length patterns

### 6. Structured Logging Format

```typescript
// Standardized log format
interface StructuredLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  endpoint: string;
  requestId: string;
  conversationId?: string;
  userId?: string;
  metrics?: ChatMetrics;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  message: string;
  [key: string]: any;
}

// Ensure consistent format
logger.info('message', {
  // All additional fields as key-value pairs
});
```

**Tasks:**
- [ ] Define StructuredLog interface
- [ ] Update logger to enforce structure
- [ ] Ensure consistent field naming
- [ ] Document log schema

## Verification Criteria

- [ ] Logs show metrics for all phases (embedding, search, AI, DB)
- [ ] Percentiles calculated every 10 requests
- [ ] p95 latency stable (< 1500ms) under normal load
- [ ] EXPLAIN shows index usage on messages queries
- [ ] All logs include request ID
- [ ] Conversation metrics logged correctly
- [ ] Performance data can be aggregated for analysis
- [ ] No performance regression from baseline
- [ ] Alerts trigger when p95 exceeds threshold

## Performance Baselines

Establish baselines for comparison:

```typescript
// Example baseline targets
const PERFORMANCE_TARGETS = {
  validation: 5,           // ms
  historyRetrieval: 50,    // ms
  messageSave: 30,         // ms
  embeddingGeneration: 200,// ms
  vectorSearch: 100,       // ms
  documentRetrieval: 50,   // ms
  aiGeneration: 800,       // ms
  responseSave: 30,        // ms
  total: 1500              // ms (p95)
};
```

**Tasks:**
- [ ] Establish baseline metrics in test environment
- [ ] Document targets
- [ ] Compare actual vs. baseline
- [ ] Identify optimization opportunities

## Monitoring Dashboard Ideas

Consider creating aggregation queries for:
- Requests per minute/hour
- p50/p95/p99 latencies by phase
- Error rates by type
- Model usage distribution
- Cache hit rates (when caching implemented)
- Circuit breaker state changes

## References

- Remediation Plan: Domain G (Performance & Observability)
- Existing logger: src/utils/logger.ts
- Current timing: Limited basic timing in place
