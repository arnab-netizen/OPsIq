-- Module 8 — employee workload snapshot persistence.
-- Additive only; idempotent (IF NOT EXISTS); no FK (mirrors delegated_tasks).

CREATE TABLE IF NOT EXISTS "owner_employee_workload_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "employee_user_id" UUID,
    "employee_label" TEXT,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "shift_hours" DOUBLE PRECISION NOT NULL,
    "break_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "task_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "travel_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rework_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtime_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "utilization" DOUBLE PRECISION NOT NULL,
    "utilization_pct" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "overburdened" BOOLEAN NOT NULL DEFAULT false,
    "fatigue_risk" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_employee_workload_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_employee_workload_snapshots_workspace_id_idx" ON "owner_employee_workload_snapshots"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_employee_workload_snapshots_workspace_id_band_idx" ON "owner_employee_workload_snapshots"("workspace_id", "band");
