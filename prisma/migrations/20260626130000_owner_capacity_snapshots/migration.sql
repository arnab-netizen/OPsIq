-- Module 10 — capacity/bottleneck snapshot persistence.
-- Additive only; idempotent (IF NOT EXISTS); no FK (mirrors delegated_tasks).

CREATE TABLE IF NOT EXISTS "owner_capacity_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "current_revenue" DOUBLE PRECISION NOT NULL,
    "safe_utilization" DOUBLE PRECISION NOT NULL,
    "resources" JSONB NOT NULL,
    "bottleneck_resource" TEXT,
    "bottleneck_utilization" DOUBLE PRECISION NOT NULL,
    "revenue_ceiling" DOUBLE PRECISION,
    "safe_revenue_ceiling" DOUBLE PRECISION,
    "growth_capacity_revenue" DOUBLE PRECISION NOT NULL,
    "available_buffer" DOUBLE PRECISION NOT NULL,
    "expansion_triggered" BOOLEAN NOT NULL DEFAULT false,
    "growth_safe" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_capacity_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_capacity_snapshots_workspace_id_idx" ON "owner_capacity_snapshots"("workspace_id");
