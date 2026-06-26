-- Module 9 — owner workload snapshot persistence.
-- Additive only; idempotent (IF NOT EXISTS); no FK (mirrors delegated_tasks).

CREATE TABLE IF NOT EXISTS "owner_workload_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "owner_minutes_per_day" DOUBLE PRECISION NOT NULL,
    "sustainable_minutes_per_day" DOUBLE PRECISION NOT NULL,
    "owner_tasks" INTEGER NOT NULL DEFAULT 0,
    "owner_only_critical_tasks" INTEGER NOT NULL DEFAULT 0,
    "daily_load" DOUBLE PRECISION NOT NULL,
    "daily_load_pct" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "bottleneck_risk" BOOLEAN NOT NULL DEFAULT false,
    "overloaded" BOOLEAN NOT NULL DEFAULT false,
    "recommended_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_workload_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_workload_snapshots_workspace_id_idx" ON "owner_workload_snapshots"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_workload_snapshots_workspace_id_band_idx" ON "owner_workload_snapshots"("workspace_id", "band");
