/**
 * Type definitions for RAG application with document tracking
 */

/**
 * Document stored in KV
 */
export interface StoredDocument {
  content: string;
  contentType: string;
  uploadedAt: number; // Unix timestamp
  metadata: DocumentMetadata;
}

/**
 * Extensible metadata for documents
 */
export interface DocumentMetadata {
  title: string;
  author?: string;
  source?: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown; // Allow custom fields
}

/**
 * Document record in D1 database
 */
export interface DocumentRecord {
  id: string;
  title: string;
  content_type: string | null;
  uploaded_at: number;
  chunk_count: number;
  metadata: string | null; // JSON string
}

/**
 * Note/chunk record in D1 database
 */
export interface NoteRecord {
  id: string;
  document_id: string;
  text: string;
  chunk_index: number;
}

/**
 * Metadata stored with each vector in Vectorize
 */
export interface VectorMetadata {
  document_id: string;
  note_id: string;
  chunk_index: number;
}

/**
 * Input for creating a new document
 */
export interface CreateDocumentInput {
  content: string;
  title: string;
  contentType?: string;
  metadata?: Partial<DocumentMetadata>;
}

/**
 * Complete document with all related data
 */
export interface DocumentWithChunks {
  id: string;
  title: string;
  contentType: string | null;
  uploadedAt: number;
  content: string;
  chunks: NoteRecord[];
  metadata: DocumentMetadata;
}

/**
 * Query result with source attribution
 */
export interface QueryResult {
  answer: string;
  sources: DocumentSource[];
  modelUsed: string;
}

/**
 * Source document information for citations
 */
export interface DocumentSource {
  documentId: string;
  title: string;
  chunkText: string;
  similarity: number;
}

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  AI: Ai;
  DATABASE: D1Database;
  VECTOR_INDEX: VectorizeIndex;
  DOCUMENTS: KVNamespace; // KV store for full documents
  RAG_WORKFLOW: Workflow;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  /**
   * If set to the string "true", enables text splitting. Any other value (including "false" or undefined) disables it.
   */
  ENABLE_TEXT_SPLITTING?: string;
}

/**
 * Log levels for verbose logging
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

/**
 * Workflow step input for document processing
 */
export interface WorkflowStepInput {
  documentId: string;
  content: string;
  title: string;
  enableTextSplitting: boolean;
}

/**
 * Result from embedding generation step
 */
export interface EmbeddingResult {
  noteId: string;
  documentId: string;
  chunkIndex: number;
  success: boolean;
  error?: string;
}

/**
 * Conversation record in D1 database
 */
export interface Conversation {
  id: string;
  created_at: number;
}

/**
 * Message record in D1 database
 */
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: string | null;
  created_at: number;
}

/**
 * Chat message with optional source attribution
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ id: string; text: string }>;
}
