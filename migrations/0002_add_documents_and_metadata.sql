-- Migration number: 0002 	 2025-11-18T00:00:00.000Z
-- Add document storage and metadata tracking

-- Create documents table to track source documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT,
  uploaded_at INTEGER NOT NULL,
  chunk_count INTEGER DEFAULT 0,
  metadata TEXT -- JSON string for extensibility
);

-- Create index on uploaded_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);

-- Backup existing notes (for safety)
CREATE TABLE IF NOT EXISTS notes_backup AS SELECT * FROM notes;

-- Create new notes table with document tracking
CREATE TABLE IF NOT EXISTS notes_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  text TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Create index on document_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notes_document_id ON notes_new(document_id);

-- Migrate existing notes to new schema
-- Existing notes will be assigned to a special "legacy" document
INSERT INTO documents (id, title, content_type, uploaded_at, chunk_count, metadata)
VALUES ('legacy-document', 'Legacy Notes', 'text/plain', strftime('%s', 'now'),
        (SELECT COUNT(*) FROM notes), '{"source":"migration","description":"Pre-existing notes before document tracking"}');

INSERT INTO notes_new (id, document_id, text, chunk_index)
SELECT id, 'legacy-document', text, 0 FROM notes;

-- Replace old notes table with new one
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- Note: notes_backup table is kept for manual verification
-- It can be dropped after confirming migration success with:
-- DROP TABLE notes_backup;
