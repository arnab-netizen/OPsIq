-- Additive, zero-risk migration: adds a nullable businessId to process_execution_tasks.
--
-- Root cause this closes (part of the Start Work -> Priorities -> Actions P0): taskKey for
-- PROCESS_CORRECTION/CASH_PROFIT routes (e.g. "cp:MISSING_UNIT_ECONOMICS") was not tenant-safe --
-- two businesses in the same workspace with the same signal type would upsert into and act on the
-- SAME persisted ProcessExecutionTask row. taskKey generation now embeds businessId directly (see
-- process-execution-bridge.ts); this column is the defense-in-depth companion, letting reads and
-- the START/COMPLETE/etc. action guard verify business ownership without re-parsing taskKey.
--
-- business_id = NULL is valid: the PASS 23 expansion route families (workload/capability/SOP/
-- training/effectiveness) remain workspace-scoped only, unchanged by this migration. No backfill:
-- every existing row (including any already-started task) defaults to NULL and keeps working
-- exactly as before.

ALTER TABLE "process_execution_tasks" ADD COLUMN "business_id" UUID;

CREATE INDEX "process_execution_tasks_workspace_id_business_id_status_idx" ON "process_execution_tasks"("workspace_id", "business_id", "status");
