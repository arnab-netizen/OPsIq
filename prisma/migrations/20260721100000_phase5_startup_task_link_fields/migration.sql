-- G3: Add startup link fields to ProcessExecutionTask so the execution gate can resolve
-- the full authorization context (sessionId, blueprintId, planId) without a full-table scan
-- on JSON taskIds arrays. These are nullable — non-startup tasks leave them NULL.

ALTER TABLE "process_execution_tasks"
  ADD COLUMN IF NOT EXISTS "linked_startup_session_id"   UUID,
  ADD COLUMN IF NOT EXISTS "linked_startup_blueprint_id" UUID,
  ADD COLUMN IF NOT EXISTS "linked_startup_plan_id"      UUID;

CREATE INDEX IF NOT EXISTS "pet_linked_startup_session_idx"
  ON "process_execution_tasks" ("workspace_id", "linked_startup_session_id");
