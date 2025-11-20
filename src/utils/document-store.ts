/**
 * DocumentStore - Manages document storage across KV and D1
 *
 * Handles the hybrid storage approach:
 * - KV: Full document content
 * - D1: Document metadata and searchable fields
 *
 * Ensures consistency between both storage layers.
 */

import {
  StoredDocument,
  DocumentRecord,
  NoteRecord,
  CreateDocumentInput,
  DocumentWithChunks,
  DocumentMetadata,
  Env,
} from '../types';
import { Logger } from './logger';

export class DocumentStore {
  private static readonly MAX_IDS = 1000;
  private kv: KVNamespace;
  private db: D1Database;
  private logger: Logger;

  constructor(env: Env, logger: Logger) {
    this.kv = env.DOCUMENTS;
    this.db = env.DATABASE;
    this.logger = logger.child({ component: 'DocumentStore' });
  }

  /**
   * Generate a KV key for a document
   */
  private getDocumentKey(documentId: string): string {
    return `doc:${documentId}`;
  }

  /**
   * Create a new document with content stored in KV and metadata in D1
   */
  async createDocument(
    input: CreateDocumentInput,
    documentId: string
  ): Promise<void> {
    this.logger.info('Creating document', { documentId, title: input.title });
    this.logger.startTimer(`createDocument:${documentId}`);

    try {
      // Prepare stored document for KV
      const storedDoc: StoredDocument = {
        content: input.content,
        contentType: input.contentType || 'text/plain',
        uploadedAt: Date.now(),
        metadata: {
          title: input.title,
          ...input.metadata,
        },
      };

      // Store full document in KV
      const kvKey = this.getDocumentKey(documentId);
      this.logger.debug('Storing document in KV', { kvKey, contentLength: input.content.length });

      await this.kv.put(kvKey, JSON.stringify(storedDoc), {
        metadata: {
          documentId,
          title: input.title,
          uploadedAt: storedDoc.uploadedAt,
        },
      });

      this.logger.debug('Document stored in KV successfully', { kvKey });

      // Store metadata in D1
      this.logger.debug('Storing document metadata in D1', { documentId });

      await this.db
        .prepare(
          `INSERT INTO documents (id, title, content_type, uploaded_at, chunk_count, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          documentId,
          input.title,
          storedDoc.contentType,
          storedDoc.uploadedAt,
          0, // Initial chunk count, will be updated later
          JSON.stringify(storedDoc.metadata)
        )
        .run();

      this.logger.debug('Document metadata stored in D1 successfully', { documentId });
      this.logger.endTimer(`createDocument:${documentId}`, { success: true });
    } catch (error) {
      this.logger.error(
        'Failed to create document',
        error instanceof Error ? error : new Error(String(error)),
        { documentId, title: input.title }
      );
      this.logger.endTimer(`createDocument:${documentId}`, { success: false });
      throw error;
    }
  }

  /**
   * Retrieve a document by ID (combines KV content with D1 metadata)
   */
  async getDocument(documentId: string): Promise<DocumentWithChunks | null> {
    this.logger.debug('Retrieving document', { documentId });
    this.logger.startTimer(`getDocument:${documentId}`);

    try {
      // Get content from KV
      const kvKey = this.getDocumentKey(documentId);
      const kvData = await this.kv.get<StoredDocument>(kvKey, 'json');

      if (!kvData) {
        this.logger.warn('Document not found in KV', { documentId, kvKey });
        this.logger.endTimer(`getDocument:${documentId}`, { found: false });
        return null;
      }

      this.logger.debug('Document retrieved from KV', { documentId, contentLength: kvData.content.length });

      // Get metadata from D1
      const metadataResult = await this.db
        .prepare('SELECT * FROM documents WHERE id = ?')
        .bind(documentId)
        .first<DocumentRecord>();

      if (!metadataResult) {
        this.logger.warn('Document metadata not found in D1', { documentId });
        // KV exists but D1 doesn't - data inconsistency
        this.logger.endTimer(`getDocument:${documentId}`, { found: false, inconsistency: true });
        return null;
      }

      // Get associated chunks
      const chunksResult = await this.db
        .prepare('SELECT * FROM notes WHERE document_id = ? ORDER BY chunk_index')
        .bind(documentId)
        .all<NoteRecord>();

      const chunks = chunksResult.results || [];
      this.logger.debug('Retrieved document chunks', { documentId, chunkCount: chunks.length });

      const metadata: DocumentMetadata = metadataResult.metadata
        ? JSON.parse(metadataResult.metadata)
        : { title: metadataResult.title };

      const document: DocumentWithChunks = {
        id: documentId,
        title: metadataResult.title,
        contentType: metadataResult.content_type,
        uploadedAt: metadataResult.uploaded_at,
        content: kvData.content,
        chunks,
        metadata,
      };

      this.logger.endTimer(`getDocument:${documentId}`, { found: true, chunkCount: chunks.length });
      return document;
    } catch (error) {
      this.logger.error(
        'Failed to retrieve document',
        error instanceof Error ? error : new Error(String(error)),
        { documentId }
      );
      this.logger.endTimer(`getDocument:${documentId}`, { success: false });
      throw error;
    }
  }

  /**
   * Update the chunk count for a document
   */
  async updateChunkCount(documentId: string, chunkCount: number): Promise<void> {
    this.logger.debug('Updating chunk count', { documentId, chunkCount });

    try {
      await this.db
        .prepare('UPDATE documents SET chunk_count = ? WHERE id = ?')
        .bind(chunkCount, documentId)
        .run();

      this.logger.debug('Chunk count updated', { documentId, chunkCount });
    } catch (error) {
      this.logger.error(
        'Failed to update chunk count',
        error instanceof Error ? error : new Error(String(error)),
        { documentId, chunkCount }
      );
      throw error;
    }
  }

  /**
   * Create a note/chunk linked to a document
   */
  async createNote(note: NoteRecord): Promise<void> {
    this.logger.debug('Creating note', {
      noteId: note.id,
      documentId: note.document_id,
      chunkIndex: note.chunk_index,
      textLength: note.text.length,
    });

    try {
      await this.db
        .prepare(
          'INSERT INTO notes (id, document_id, text, chunk_index) VALUES (?, ?, ?, ?)'
        )
        .bind(note.id, note.document_id, note.text, note.chunk_index)
        .run();

      this.logger.debug('Note created successfully', { noteId: note.id });
    } catch (error) {
      this.logger.error(
        'Failed to create note',
        error instanceof Error ? error : new Error(String(error)),
        { noteId: note.id, documentId: note.document_id }
      );
      throw error;
    }
  }

  /**
   * Delete a document and all associated data
   */
  async deleteDocument(documentId: string): Promise<void> {
    this.logger.info('Deleting document', { documentId });
    this.logger.startTimer(`deleteDocument:${documentId}`);

    try {
      // Delete from KV
      const kvKey = this.getDocumentKey(documentId);
      await this.kv.delete(kvKey);
      this.logger.debug('Document deleted from KV', { kvKey });

      // Delete from D1 (notes will cascade delete due to foreign key)
      await this.db
        .prepare('DELETE FROM documents WHERE id = ?')
        .bind(documentId)
        .run();

      this.logger.debug('Document deleted from D1', { documentId });
      this.logger.endTimer(`deleteDocument:${documentId}`, { success: true });
    } catch (error) {
      this.logger.error(
        'Failed to delete document',
        error instanceof Error ? error : new Error(String(error)),
        { documentId }
      );
      this.logger.endTimer(`deleteDocument:${documentId}`, { success: false });
      throw error;
    }
  }

  /**
   * List all documents (metadata only)
   */
  async listDocuments(limit = 100, offset = 0): Promise<DocumentRecord[]> {
    this.logger.debug('Listing documents', { limit, offset });

    try {
      const result = await this.db
        .prepare(
          'SELECT * FROM documents ORDER BY uploaded_at DESC LIMIT ? OFFSET ?'
        )
        .bind(limit, offset)
        .all<DocumentRecord>();

      const documents = result.results || [];
      this.logger.debug('Documents listed', { count: documents.length, limit, offset });

      return documents;
    } catch (error) {
      this.logger.error(
        'Failed to list documents',
        error instanceof Error ? error : new Error(String(error)),
        { limit, offset }
      );
      throw error;
    }
  }

  /**
   * Get notes by IDs (used for RAG query results)
   * Enforces a maximum limit on the number of IDs to prevent DoS/query size violations
   */
  async getNotesByIds(noteIds: string[]): Promise<NoteRecord[]> {
    if (noteIds.length === 0) {
      return [];
    }

    // Check if array exceeds maximum limit
    if (noteIds.length > DocumentStore.MAX_IDS) {
      this.logger.warn('Note ID array exceeds maximum', {
        requested: noteIds.length,
        limit: DocumentStore.MAX_IDS
      });
    }

    // Limit to MAX_IDS to prevent query size violations
    const limitedIds = noteIds.slice(0, DocumentStore.MAX_IDS);

    this.logger.debug('Retrieving notes by IDs', { count: limitedIds.length });

    try {
      const placeholders = limitedIds.map(() => '?').join(',');
      const result = await this.db
        .prepare(`SELECT * FROM notes WHERE id IN (${placeholders})`)
        .bind(...limitedIds)
        .all<NoteRecord>();

      const notes = result.results || [];
      this.logger.debug('Notes retrieved', { requested: limitedIds.length, found: notes.length });

      return notes;
    } catch (error) {
      this.logger.error(
        'Failed to retrieve notes by IDs',
        error instanceof Error ? error : new Error(String(error)),
        { count: limitedIds.length }
      );
      throw error;
    }
  }
}
