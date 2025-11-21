# Testing Documentation

## Test Setup

This project uses [Vitest](https://vitest.dev/) for unit and integration testing.

### Installing Test Dependencies

```bash
npm install --save-dev vitest @vitest/coverage-v8 @cloudflare/vitest-pool-workers
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test tests/logger.test.ts
```

### Test Structure

```
tests/
  ├── logger.test.ts           # Logger utility unit tests
  ├── document-store.test.ts   # DocumentStore integration tests (mocked)
  └── README.md               # This file
```

## Testing Strategy

### Unit Tests
- **Logger**: Test logging functionality, timer tracking, error handling
- **Utility functions**: Test individual helper functions in isolation

### Integration Tests
- **DocumentStore**: Test KV and D1 interactions (with mocks)
- **API Endpoints**: Test request/response handling (with mocked bindings)

### Limitations

Due to Cloudflare Workers environment constraints:

1. **Vectorize bindings** do not support local development
2. **AI bindings** always access remote resources
3. **KV and D1** require either remote bindings or miniflare for local testing

### Mocking Strategy

For tests that require Cloudflare bindings:

```typescript
import { vi } from 'vitest';

// Mock KV namespace
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

// Mock D1 database
const mockD1 = {
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      run: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
    })),
  })),
};

// Mock environment
const mockEnv = {
  DOCUMENTS: mockKV,
  DATABASE: mockD1,
  AI: mockAI,
  VECTOR_INDEX: mockVectorize,
  // ...
};
```

## Test Coverage Goals

- **Utilities**: 90%+ coverage (Logger, DocumentStore)
- **Business Logic**: 80%+ coverage (Workflow, API handlers)
- **Integration**: Key happy paths and error scenarios

## Continuous Integration

Tests should be run:
- Before every commit (via git hooks)
- On pull request creation
- Before deployment to production

## Writing New Tests

When adding new features:

1. Write tests first (TDD approach)
2. Test happy path
3. Test error conditions
4. Test edge cases
5. Ensure tests are deterministic and isolated
6. Mock external dependencies appropriately

## Future Enhancements

- Add E2E tests using Cloudflare Workers test environment
- Add performance benchmarks
- Add contract tests for API endpoints
- Integrate with CI/CD pipeline
