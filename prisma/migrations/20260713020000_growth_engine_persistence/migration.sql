-- Growth: Acquisition Metrics Persistence
-- Replaces BUILT_VOLATILE in-memory Map in AcquisitionEngine.
CREATE TABLE "acquisition_metrics_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "qualified_leads" INTEGER,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "cost_per_lead" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost_per_acquisition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "target_cpa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "acquisition_metrics_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "acquisition_metrics_records_workspace_id_idx" ON "acquisition_metrics_records"("workspace_id");
CREATE INDEX "acquisition_metrics_records_workspace_id_channel_month_idx" ON "acquisition_metrics_records"("workspace_id", "channel", "month");

-- Growth: Price Tier Persistence
-- Replaces BUILT_VOLATILE in-memory Map in PricingEngine.
-- Includes plan-required schema: currency, unit of measure, effective dates,
-- version history (append-only via superseded_by_id), variable/allocated costs,
-- customer segment, channel, quantity breaks, discount structure, approval status,
-- provenance. Derived margin is computed at read time — NOT stored.
CREATE TABLE "growth_price_tiers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit_of_measure" TEXT NOT NULL DEFAULT 'seat',
    "entry_price" DOUBLE PRECISION NOT NULL,
    "max_price" DOUBLE PRECISION NOT NULL,
    "variable_cost" DOUBLE PRECISION,
    "allocated_cost" DOUBLE PRECISION,
    "customer_segment" TEXT,
    "channel" TEXT,
    "quantity_breaks" JSONB,
    "discount_structure" JSONB,
    "features" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approval_status" TEXT NOT NULL DEFAULT 'pending_approval',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "provenance" TEXT,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "superseded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "growth_price_tiers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "growth_price_tiers_workspace_id_idx" ON "growth_price_tiers"("workspace_id");
CREATE INDEX "growth_price_tiers_workspace_id_approval_status_idx" ON "growth_price_tiers"("workspace_id", "approval_status");
CREATE INDEX "growth_price_tiers_workspace_id_status_idx" ON "growth_price_tiers"("workspace_id", "status");
