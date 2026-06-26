-- Module 41 wiring — supplier/inventory risk signal persistence.
-- Additive only; idempotent (IF NOT EXISTS); no FK (mirrors owner_*_snapshots).
-- Wraps the M23 supplier-inventory domain so the Owner Now View has a live source.

CREATE TABLE IF NOT EXISTS "owner_supplier_inventory_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID,
    "worst_stockout_risk" TEXT NOT NULL,
    "below_reorder_count" INTEGER NOT NULL DEFAULT 0,
    "stockout_count" INTEGER NOT NULL DEFAULT 0,
    "unreliable_supplier_count" INTEGER NOT NULL DEFAULT 0,
    "supply_cutoff_risk" BOOLEAN NOT NULL DEFAULT false,
    "risk_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_supplier_inventory_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "owner_supplier_inventory_snapshots_workspace_id_idx" ON "owner_supplier_inventory_snapshots"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_supplier_inventory_snapshots_workspace_id_created_at_idx" ON "owner_supplier_inventory_snapshots"("workspace_id", "created_at");
