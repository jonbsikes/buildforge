-- Add field_log_id FK to documents so field-log photos can be linked back
-- to their originating log while still living in Documents > Field Photos.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS field_log_id uuid
    REFERENCES field_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_field_log_id
  ON documents(field_log_id)
  WHERE field_log_id IS NOT NULL;
