-- Owner Budget: vendor master + invoice-hash duplicate detection + funded-initiative outcomes.

ALTER TABLE "spend_entries" ADD COLUMN IF NOT EXISTS "vendor_id" UUID;
ALTER TABLE "spend_entries" ADD COLUMN IF NOT EXISTS "invoice_hash" TEXT;
CREATE INDEX IF NOT EXISTS "spend_entries_workspace_id_invoice_hash_idx" ON "spend_entries"("workspace_id", "invoice_hash");

CREATE TABLE IF NOT EXISTS "vendor_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bank_account_ref" TEXT,
    "bank_verified" BOOLEAN NOT NULL DEFAULT false,
    "bank_changed_at" TIMESTAMP(3),
    "related_party" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vendor_records_workspace_id_idx" ON "vendor_records"("workspace_id");
CREATE INDEX IF NOT EXISTS "vendor_records_workspace_id_business_id_idx" ON "vendor_records"("workspace_id", "business_id");

CREATE TABLE IF NOT EXISTS "funded_initiative_outcomes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "initiative_label" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "next_step" TEXT NOT NULL,
    "safe_for_learning" BOOLEAN NOT NULL,
    "expected_impact" DOUBLE PRECISION,
    "actual_impact" DOUBLE PRECISION,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "funded_initiative_outcomes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "funded_initiative_outcomes_workspace_id_idx" ON "funded_initiative_outcomes"("workspace_id");
CREATE INDEX IF NOT EXISTS "funded_initiative_outcomes_workspace_id_business_id_idx" ON "funded_initiative_outcomes"("workspace_id", "business_id");
