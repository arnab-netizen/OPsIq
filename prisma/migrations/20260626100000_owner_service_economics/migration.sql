-- Module 6 — per-service/segment unit economics persistence.
-- Additive only; idempotent (IF NOT EXISTS); no FK (mirrors delegated_tasks).

CREATE TABLE IF NOT EXISTS "owner_service_economics" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID,
    "service_line" TEXT NOT NULL,
    "segment" TEXT,
    "revenue" DOUBLE PRECISION NOT NULL,
    "direct_cost" DOUBLE PRECISION NOT NULL,
    "contribution_margin" DOUBLE PRECISION NOT NULL,
    "contribution_margin_pct" DOUBLE PRECISION NOT NULL,
    "profit_per_labour_hour" DOUBLE PRECISION,
    "profit_per_machine_hour" DOUBLE PRECISION,
    "loss_making" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_service_economics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_service_economics_workspace_id_idx" ON "owner_service_economics"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_service_economics_workspace_id_service_line_idx" ON "owner_service_economics"("workspace_id", "service_line");
