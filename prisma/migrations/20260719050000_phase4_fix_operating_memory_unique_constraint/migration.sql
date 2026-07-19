-- Fix: the original operating_memory_entries 3-field unique constraint was named
-- "ome_workspace_type_source_unique" but the versioning migration (20260719040000)
-- dropped a different name ("operating_memory_entries_workspace_id_memory_type_source_id_key").
-- The IF EXISTS silently skipped it, leaving the legacy 3-field constraint active.
-- Drop it now so append-only versioning (multiple rows per source) can work.

ALTER TABLE "operating_memory_entries" DROP CONSTRAINT IF EXISTS "ome_workspace_type_source_unique";
