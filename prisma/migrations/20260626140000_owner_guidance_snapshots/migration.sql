-- Module 41 — Owner Now View guidance snapshot persistence.
-- Additive only; idempotent (IF NOT EXISTS); no FK (mirrors owner_*_snapshots).
-- Enables "what changed since last check" by comparing against the prior snapshot.

CREATE TABLE IF NOT EXISTS "owner_guidance_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID,
    "classification" TEXT NOT NULL,
    "cash_safe" BOOLEAN NOT NULL,
    "growth_gate_passed" BOOLEAN NOT NULL,
    "staff_overloaded" BOOLEAN NOT NULL,
    "owner_overloaded" BOOLEAN NOT NULL,
    "data_confidence" TEXT NOT NULL,
    "top_issue_count" INTEGER NOT NULL DEFAULT 0,
    "missing_data_count" INTEGER NOT NULL DEFAULT 0,
    "cash_runway_days" DOUBLE PRECISION NOT NULL,
    "net_margin_pct" DOUBLE PRECISION NOT NULL,
    "complaints_count" INTEGER NOT NULL DEFAULT 0,
    "rework_count" INTEGER NOT NULL DEFAULT 0,
    "capacity_utilization_pct" DOUBLE PRECISION NOT NULL,
    "staff_overload_pct" DOUBLE PRECISION NOT NULL,
    "owner_load_pct" DOUBLE PRECISION NOT NULL,
    "churn_risk_score" DOUBLE PRECISION NOT NULL,
    "supplier_inventory_risk_score" DOUBLE PRECISION NOT NULL,
    "overdue_proof_count" INTEGER NOT NULL DEFAULT 0,
    "outcome_checks_due" INTEGER NOT NULL DEFAULT 0,
    "growth_readiness_tier" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_guidance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_guidance_snapshots_workspace_id_idx" ON "owner_guidance_snapshots"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_guidance_snapshots_workspace_id_created_at_idx" ON "owner_guidance_snapshots"("workspace_id", "created_at");
