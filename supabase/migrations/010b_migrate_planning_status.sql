-- ============================================================
-- Migration 010b: Migrate 'planning' project status to 'pre_construction'
-- ============================================================
-- Must run after 010_schema_fixes.sql in a separate transaction because
-- PostgreSQL requires new enum values to be committed before they can
-- be used in DML.
-- ============================================================

UPDATE projects
  SET status = 'pre_construction'
  WHERE status::text = 'p