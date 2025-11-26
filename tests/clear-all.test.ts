import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock cloudflare:workers module
vi.mock('cloudflare:workers', () => {
  return {
    WorkflowEntrypoint: class {},
    WorkflowEvent: class {},
    WorkflowStep: class {},
  };
});

// Mock HTML imports
vi.mock('../src/notes.html', () => ({ default: '<html>notes</html>' }));
vi.mock('../src/ui.html', () => ({ default: '<html>ui</html>' }));
vi.mock('../src/write.html', () => ({ default: '<html>write</html>' }));
vi.mock('../src/chat.html', () => ({ default: '<html>chat</html>' }));

// Import app after mocks
import app from '../src/index';

// Mock classes (copied/adapted from document-store.test.ts)
class MockD1Database {
  public tables: Map<string, any[]> = new Map();
  public queryLog: string[] = [];

  constructor() {
    this.tables.set('notes', []);
    this.tables.set('documents', []);
    this.tables.set('conversations', []);
    this.tables.set('messages', []);
  }

  async batch(statements: any[]) {
    // Simulate batch execution
    // Clear tables for the test
    this.tables.set('notes', []);
    this.tables.set('documents', []);
    this.tables.set('conversations', []);
    this.tables.set('messages', []);
    return [];
  }

  prepare(query: string) {
    this.queryLog.push(query);
    const self = this;

    return {
      bind: (...params: any[]) => ({
        run: async () => { return { success: true }; },
        first: async () => { return null; },
        all: async () => {
          if (query.includes('SELECT id FROM notes')) {
            return { results: self.tables.get('notes') };
          }
          return { results: [] };
        }
      }),
      all: async () => {
        if (query.includes('SELECT id FROM notes')) {
          return { results: self.tables.get('notes') };
        }
        return { results: [] };
      }
    };
  }
}

class MockVectorizeIndex {
  public deletedIds: string[] = [];

  async deleteByIds(ids: string[]): Promise<void> {
    this.deletedIds.push(...ids);
  }
}

describe('DELETE /api/clear-all', () => {
  let mockDB: MockD1Database;
  let mockVectorIndex: MockVectorizeIndex;
  let mockEnv: any;

  beforeEach(() => {
    mockDB = new MockD1Database();
    mockVectorIndex = new MockVectorizeIndex();
    mockEnv = {
      DATABASE: mockDB,
      VECTOR_INDEX: mockVectorIndex,
      AI: { run: vi.fn() },
    };
  });

  it('should clear all data', async () => {
    // 1. Setup initial data
    mockDB.tables.get('notes')!.push({ id: 'note-1' }, { id: 'note-2' });
    
    // 2. Make request
    const res = await app.request('/api/clear-all', {
      method: 'DELETE',
    }, mockEnv);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'All data cleared successfully' });

    // 3. Verify vectors deleted
    expect(mockVectorIndex.deletedIds).toContain('note-1');
    expect(mockVectorIndex.deletedIds).toContain('note-2');

    // 4. Verify DB tables cleared (our mock batch implementation clears them)
    expect(mockDB.tables.get('notes')).toHaveLength(0);
    expect(mockDB.tables.get('documents')).toHaveLength(0);
    expect(mockDB.tables.get('conversations')).toHaveLength(0);
    expect(mockDB.tables.get('messages')).toHaveLength(0);
  });
});
