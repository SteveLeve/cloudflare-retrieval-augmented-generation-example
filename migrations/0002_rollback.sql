-- Rollback for Migration 0002
-- WARNING: This will delete all document metadata and restore the old schema
-- Only use this if you need to completely revert migration 0002

-- Step 1: Restore original notes table from backup
DROP TABLE IF EXISTS notes;
ALTER TABLE notes_backup RENAME TO notes;

-- Step 2: Remove documents table and its indexes
DROP INDEX IF EXISTS idx_documents_uploaded_at;
DROP TABLE IF EXISTS documents;

-- Step 3: Remove notes table indexes added by migration 0002
DROP INDEX IF EXISTS idx_notes_document_id;

-- Verification queries (run these after rollback):
-- SELECT COUNT(*) FROM notes;  -- Should match pre-migration count
-- SELECT name FROM sqlite_master WHERE type='table';  -- Should not show 'documents' or 'notes_backup'
