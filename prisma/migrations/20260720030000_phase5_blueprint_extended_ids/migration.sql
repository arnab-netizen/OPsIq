-- Phase 5: Add resource_allocation_ids, constraint_ids, outcome_ids to StartupExecutionBlueprint.
-- These columns track IDs of linked records created during blueprint generation.

ALTER TABLE startup_execution_blueprint
  ADD COLUMN IF NOT EXISTS resource_allocation_ids JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS constraint_ids           JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS outcome_ids              JSONB NOT NULL DEFAULT '[]';
