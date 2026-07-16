-- Vendor management: contract/price history, delivery performance,
-- approved-vendor controls, payment terms, switching cost, replacement lead time.

-- Extend vendor_records with governance and operational fields.
ALTER TABLE "vendor_records"
  ADD COLUMN IF NOT EXISTS "approval_status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN IF NOT EXISTS "payment_terms_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "switching_cost_estimate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "replacement_lead_time_days" INTEGER;

-- Append-only contract and price version history per vendor.
CREATE TABLE IF NOT EXISTS "vendor_contracts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "contract_ref" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "price_per_unit" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "terms_days_net" INTEGER,
    "scope" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_contracts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vendor_contracts_workspace_id_vendor_id_idx" ON "vendor_contracts"("workspace_id", "vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_contracts_workspace_id_idx" ON "vendor_contracts"("workspace_id");

-- Per-delivery performance records accumulate on-time and quality data per vendor.
CREATE TABLE IF NOT EXISTS "vendor_delivery_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "expected_date" TIMESTAMP(3) NOT NULL,
    "actual_date" TIMESTAMP(3),
    "on_time" BOOLEAN,
    "quality_accepted" BOOLEAN,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_delivery_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vendor_delivery_records_workspace_id_vendor_id_idx" ON "vendor_delivery_records"("workspace_id", "vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_delivery_records_workspace_id_idx" ON "vendor_delivery_records"("workspace_id");
