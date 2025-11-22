-- Migration number: 0002 	 2025-11-18T00:00:00.000Z
-- Add document storage and metadata tracking
--
-- ROLLBACK PROCEDURE (if needed):
-- ================================
-- WARNING: Rolling back will delete all document metadata and break document references.
-- Only perform this rollback if absolutely necessary (e.g., critical bug in migration).
--
-- To rollback this migration:
-- 1. Restore the original notes table from backup:
--    DROP TABLE notes;
--    ALTER TABLE notes_backup RENAME TO notes;
--
-- 2. Remove the documents table and related indexes:
--    DROP INDEX IF EXISTS idx_documents_uploaded_at;
--    DROP TABLE IF EXISTS documents;
--
-- 3. Remove the notes table indexes added by this migration:
--    DROP INDEX IF EXISTS idx_notes_document_id;
--
-- Execute rollback with:
--    wrangler d1 execute DATABASE --file=migrations/0002_rollback.sql
-- (Create 0002_rollback.sql with the above DROP/ALTER commands)
--
-- VERIFICATION after rollback:
--    SELECT COUNT(*) FROM notes;  -- Should match pre-migration count
--    SELECT * FROM sqlite_master WHERE type='table';  -- Should not show 'documents'
--
-- CLEANUP after successful migration (optional):
-- Once you've verified the migration worked correctly, you can remove the backup:
--    DROP TABLE IF EXISTS notes_backup;

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
-- NOTE: Drop this table after verifying migration success with: DROP TABLE notes_backup;
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
-- Note: The uploaded_at timestamp for the legacy document is set to the migration execution time
--       using strftime('%s', 'now'), since the actual upload time of legacy notes is unknown.
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
