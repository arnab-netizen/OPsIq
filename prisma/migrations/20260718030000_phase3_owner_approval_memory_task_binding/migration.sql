-- Phase 3 — Owner Execution and Outcome Closure Engine
-- Extend OwnerApprovalMemory with task-level binding fields.
-- All columns are nullable for backward compatibility. No existing rows are affected.
-- The existing @@unique([workspaceId, scope, contentHash]) constraint is unchanged —
-- material parameter changes still invalidate approval automatically via hash mismatch.

ALTER TABLE "owner_approval_memory"
    ADD COLUMN "task_key"                 TEXT,
    ADD COLUMN "process_execution_task_id" UUID,
    ADD COLUMN "material_parameters"      JSONB;
