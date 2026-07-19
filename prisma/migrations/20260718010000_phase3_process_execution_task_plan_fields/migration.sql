-- Phase 3 — Owner Execution and Outcome Closure Engine
-- Extend ProcessExecutionTask with lifecycle timestamps and structured plan fields.
-- All columns are nullable for backward compatibility. No existing rows are affected.

ALTER TABLE "process_execution_tasks"
    ADD COLUMN "work_started_at"          TIMESTAMP(3),
    ADD COLUMN "acknowledged_by_user_id"  UUID,
    ADD COLUMN "acknowledged_at"          TIMESTAMP(3),
    ADD COLUMN "expected_benefit"         TEXT,
    ADD COLUMN "cost_estimate"            DECIMAL(14,2),
    ADD COLUMN "baseline_metric_name"     TEXT,
    ADD COLUMN "baseline_value"           DOUBLE PRECISION,
    ADD COLUMN "target_metric_name"       TEXT,
    ADD COLUMN "target_value"             DOUBLE PRECISION,
    ADD COLUMN "verification_window_days" INTEGER,
    ADD COLUMN "stop_condition"           TEXT,
    ADD COLUMN "rollback_condition"       TEXT,
    ADD COLUMN "outcome_id"               TEXT,
    ADD COLUMN "outcome_recorded_at"      TIMESTAMP(3),
    ADD COLUMN "approval_memory_id"       UUID;

CREATE INDEX "process_execution_tasks_workspace_id_outcome_id_idx"
    ON "process_execution_tasks"("workspace_id", "outcome_id");
