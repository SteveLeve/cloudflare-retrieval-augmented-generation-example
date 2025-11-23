/**
 * Unit tests for DocumentStore utility
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DocumentStore } from '../src/utils/document-store';
import { Logger } from '../src/utils/logger';
import { NoteRecord, Env } from '../src/types';

/**
 * Mock implementations for Cloudflare bindings
 */
class MockKVNamespace implements KVNamespace {
	private store: Map<string, string> = new Map();
	private metadata: Map<string, Record<string, any>> = new Map();

	async get(key: string, type?: any): Promise<string | null> {
		const value = this.store.get(key);
		if (!value) return null;

		// Handle JSON type parameter (third overload of KV.get)
		if (type === 'json') {
			try {
				return JSON.parse(value);
			} catch {
				return null;
			}
		}
		return value;
	}

	async put(key: string, value: string | ArrayBuffer, options?: any): Promise<void> {
		const stringValue = typeof value === 'string' ? value : new TextDecoder().decode(value as ArrayBuffer);
		this.store.set(key, stringValue);
		if (options?.metadata) {
			this.metadata.set(key, options.metadata);
		}
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key);
		this.metadata.delete(key);
	}

	async list(): Promise<any> {
		return { keys: Array.from(this.store.keys()) };
	}

	async getWithMetadata(key: string): Promise<any> {
		return {
			value: this.store.get(key),
			metadata: this.metadata.get(key)
		};
	}
}

class MockD1Database implements D1Database {
	private tables: Map<string, any[]> = new Map();
	private queryLog: string[] = [];

	constructor() {
		// Initialize with notes table
		this.tables.set('notes', []);
		this.tables.set('documents', []);
	}

	prepare(query: string) {
		this.queryLog.push(query);
		const self = this;

		return {
			bind: (...params: any[]) => ({
				run: async () => {
					// Simple INSERT/UPDATE/DELETE handling
					if (query.includes('INSERT INTO notes')) {
						const [id, documentId, text, chunkIndex] = params;
						self.tables.get('notes')!.push({ id, document_id: documentId, text, chunk_index: chunkIndex });
						return { success: true };
					}
					if (query.includes('INSERT INTO documents')) {
						const [id, title, contentType, uploadedAt, chunkCount, metadata] = params;
						self.tables.get('documents')!.push({ id, title, content_type: contentType, uploaded_at: uploadedAt, chunk_count: chunkCount, metadata });
						return { success: true };
					}
					if (query.includes('DELETE FROM documents')) {
						const docsToDelete = self.tables.get('documents')!.filter(d => d.id === params[0]);
						self.tables.set('documents', self.tables.get('documents')!.filter(d => d.id !== params[0]));
						// Cascade delete notes
						docsToDelete.forEach(doc => {
							self.tables.set('notes', self.tables.get('notes')!.filter(n => n.document_id !== doc.id));
						});
						return { success: true };
					}
					if (query.includes('UPDATE documents')) {
						const docs = self.tables.get('documents')!;
						const docIndex = docs.findIndex(d => d.id === params[1]);
						if (docIndex >= 0) {
							docs[docIndex].chunk_count = params[0];
						}
						return { success: true };
					}
					return { success: true };
				},
				first: async () => {
					// SELECT first
					if (query.includes('SELECT') && query.includes('FROM documents')) {
						const docId = params[0];
						return self.tables.get('documents')!.find(d => d.id === docId) || null;
					}
					return null;
				},
				all: async () => {
					// SELECT multiple
					if (query.includes('SELECT') && query.includes('FROM notes')) {
						if (query.includes('WHERE document_id')) {
							const docId = params[0];
							return { results: self.tables.get('notes')!.filter(n => n.document_id === docId) };
						}
						if (query.includes('WHERE id IN')) {
							// Simulate the getNotesByIds query
							const noteIds = params;
							return { results: self.tables.get('notes')!.filter(n => noteIds.includes(n.id)) };
						}
						return { results: self.tables.get('notes') };
					}
					if (query.includes('SELECT') && query.includes('FROM documents')) {
						if (query.includes('WHERE id IN')) {
							const docIds = params;
							return { results: self.tables.get('documents')!.filter(d => docIds.includes(d.id)) };
						}
						return { results: self.tables.get('documents') };
					}
					return { results: [] };
				}
			})
		} as any;
	}

	getQueryLog(): string[] {
		return this.queryLog;
	}

	resetQueryLog(): void {
		this.queryLog = [];
	}
}

class MockVectorizeIndex {
	private vectors: Map<string, any> = new Map();

	async query(): Promise<any> {
		return { matches: [] };
	}

	async upsert(vectors: any[]): Promise<void> {
		vectors.forEach(v => this.vectors.set(v.id, v));
	}

	async deleteByIds(ids: string[]): Promise<void> {
		ids.forEach(id => this.vectors.delete(id));
	}

	hasVector(id: string): boolean {
		return this.vectors.has(id);
	}
}

describe('DocumentStore', () => {
	let mockKV: MockKVNamespace;
	let mockDB: MockD1Database;
	let mockVectorIndex: MockVectorizeIndex;
	let mockLogger: Logger;
	let docStore: DocumentStore;
	let mockEnv: Partial<Env>;
	let consoleWarnSpy: any;

	beforeEach(() => {
		mockKV = new MockKVNamespace();
		mockDB = new MockD1Database();
		mockVectorIndex = new MockVectorizeIndex();
		mockLogger = new Logger();

		mockEnv = {
			DOCUMENTS: mockKV as any,
			DATABASE: mockDB as any,
			VECTOR_INDEX: mockVectorIndex as any,
		} as Partial<Env>;

		docStore = new DocumentStore(mockEnv as Env, mockLogger);

		// Spy on console.warn to verify warning logging
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getNotesByIds', () => {
		it('should retrieve notes by IDs when count is within limit', async () => {
			// Setup: Create some notes
			await docStore.createNote({
				id: 'note-1',
				document_id: 'doc-1',
				text: 'Note 1',
				chunk_index: 0,
			});
			await docStore.createNote({
				id: 'note-2',
				document_id: 'doc-1',
				text: 'Note 2',
				chunk_index: 1,
			});

			// Test: Retrieve notes
			const notes = await docStore.getNotesByIds(['note-1', 'note-2']);

			expect(notes).toHaveLength(2);
			expect(notes[0].text).toBe('Note 1');
			expect(notes[1].text).toBe('Note 2');
		});

		it('should limit note IDs to maximum and log warning when exceeded', async () => {
			// Setup: Create many notes (we'll request 1001)
			const noteIds: string[] = [];
			for (let i = 0; i < 10; i++) {
				const noteId = `note-${i}`;
				noteIds.push(noteId);
				await docStore.createNote({
					id: noteId,
					document_id: 'doc-1',
					text: `Note ${i}`,
					chunk_index: i,
				});
			}

			// Create an array of 1001 IDs to trigger the limit
			const largeIdArray = Array.from({ length: 1001 }, (_, i) => `note-${i}`);

			// Test: Call with excessive IDs
			const notes = await docStore.getNotesByIds(largeIdArray);

			// Should warn about exceeding limit
			expect(consoleWarnSpy).toHaveBeenCalled();
			const warnCall = consoleWarnSpy.mock.calls.find((call: any[]) =>
				call[0]?.includes('Note ID array exceeds maximum')
			);
			expect(warnCall).toBeDefined();
			expect(warnCall[0]).toContain('1001');
			expect(warnCall[0]).toContain('1000');

			// Should only return up to 1000 (or however many exist)
			expect(notes.length).toBeLessThanOrEqual(1000);
		});

		it('should return empty array when no IDs provided', async () => {
			const notes = await docStore.getNotesByIds([]);
			expect(notes).toHaveLength(0);
		});

		it('should handle empty result gracefully', async () => {
			const notes = await docStore.getNotesByIds(['nonexistent']);
			expect(notes).toHaveLength(0);
		});
	});

	describe('deleteDocument', () => {
		it('should delete document from KV and D1', async () => {
			// Setup: Create a document
			await docStore.createDocument(
				{
					content: 'Test document',
					title: 'Test Doc',
					contentType: 'text/plain',
					metadata: {},
				},
				'doc-1'
			);

			// Test: Delete the document
			await docStore.deleteDocument('doc-1');

			// Verify: Document should not exist in KV or D1
			const document = await docStore.getDocument('doc-1');
			expect(document).toBeNull();
		});

		it('should delete associated notes and vectors when deleting document', async () => {
			// Setup: Create document with notes
			const docId = 'doc-1';
			await docStore.createDocument(
				{
					content: 'Test document',
					title: 'Test Doc',
					contentType: 'text/plain',
					metadata: {},
				},
				docId
			);

			// Create associated notes
			const note1: NoteRecord = {
				id: 'note-1',
				document_id: docId,
				text: 'Note 1',
				chunk_index: 0,
			};
			const note2: NoteRecord = {
				id: 'note-2',
				document_id: docId,
				text: 'Note 2',
				chunk_index: 1,
			};

			await docStore.createNote(note1);
			await docStore.createNote(note2);

			// Simulate vectors being in the index
			await mockVectorIndex.upsert([
				{ id: 'note-1', values: [0.1, 0.2], metadata: { document_id: docId } },
				{ id: 'note-2', values: [0.3, 0.4], metadata: { document_id: docId } },
			]);

			// Verify vectors exist before deletion
			expect(mockVectorIndex.hasVector('note-1')).toBe(true);
			expect(mockVectorIndex.hasVector('note-2')).toBe(true);

			// Test: Delete the document
			await docStore.deleteDocument(docId);

			// Verify: Vectors should be cleaned up from index
			expect(mockVectorIndex.hasVector('note-1')).toBe(false);
			expect(mockVectorIndex.hasVector('note-2')).toBe(false);

			// Verify: Document and notes removed from DB
			const document = await docStore.getDocument(docId);
			expect(document).toBeNull();
		});
	});

	describe('createDocument', () => {
		it('should create document in both KV and D1', async () => {
			await docStore.createDocument(
				{
					content: 'Test content',
					title: 'Test Document',
					contentType: 'text/plain',
					metadata: { author: 'test' },
				},
				'doc-1'
			);

			const document = await docStore.getDocument('doc-1');
			expect(document).not.toBeNull();
			expect(document?.title).toBe('Test Document');
			expect(document?.content).toBe('Test content');
		});
	});

	describe('createNote', () => {
		it('should create note in database', async () => {
			const note: NoteRecord = {
				id: 'note-1',
				document_id: 'doc-1',
				text: 'Test note',
				chunk_index: 0,
			};

			await docStore.createNote(note);

			const notes = await docStore.getNotesByIds(['note-1']);
			expect(notes).toHaveLength(1);
			expect(notes[0].text).toBe('Test note');
		});
	});

	describe('listDocuments', () => {
		it('should list all documents', async () => {
			// Setup: Create multiple documents
			await docStore.createDocument(
				{
					content: 'Doc 1',
					title: 'Document 1',
					contentType: 'text/plain',
				},
				'doc-1'
			);

			await docStore.createDocument(
				{
					content: 'Doc 2',
					title: 'Document 2',
					contentType: 'text/plain',
				},
				'doc-2'
			);

			// Test: List documents
			const documents = await docStore.listDocuments();

			expect(documents.length).toBeGreaterThanOrEqual(2);
		});
	});
});
