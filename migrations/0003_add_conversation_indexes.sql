-- Migration: Add indexes for conversations table
-- Purpose: Improve query performance for conversation list operations
--
-- This migration adds an index on conversations.created_at to support
-- efficient sorting and filtering of conversations by creation time.

CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
