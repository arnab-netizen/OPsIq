-- Phase 3 — Owner Execution and Outcome Closure Engine
-- New model: ProcessExecutionTaskProgress
-- Immutable progress history rows for a ProcessExecutionTask.
-- Each progress update is a new row; rows are never mutated after creation.

CREATE TABLE "process_execution_task_progress" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id"   UUID         NOT NULL,
    "task_id"        UUID         NOT NULL,
    "actor_id"       UUID         NOT NULL,
    "progress_pct"   INTEGER,
    "stage"          TEXT,
    "note"           TEXT,
    "evidence_ref"   TEXT,
    "blocker_active" BOOLEAN      NOT NULL DEFAULT false,
    "blocker_reason" TEXT,
    "next_step"      TEXT,
    "revised_due_at" TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_execution_task_progress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "process_execution_task_progress_workspace_id_task_id_idx"
    ON "process_execution_task_progress"("workspace_id", "task_id");

CREATE INDEX "process_execution_task_progress_workspace_id_task_id_created_at_idx"
    ON "process_execution_task_progress"("workspace_id", "task_id", "created_at");
