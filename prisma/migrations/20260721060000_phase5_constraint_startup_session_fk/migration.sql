-- Phase 5: add linked_startup_session_id to constraint_resolution_records
-- Required by queryCurrentSnapshotIds() and startup-execution-blueprint.service.ts

ALTER TABLE constraint_resolution_records
  ADD COLUMN IF NOT EXISTS linked_startup_session_id UUID NULL;

CREATE INDEX IF NOT EXISTS constraint_resolution_records_workspace_id_linked_startup_session_id_idx
  ON constraint_resolution_records (workspace_id, linked_startup_session_id);
