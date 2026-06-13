-- Module 10 Connectors & Data Intake: data-intake persistence (additive). Creates
-- 1 new table (owner_data_intakes) that reuses owner_businesses via FK. ADDITIVE
-- ONLY: no ALTER/DROP on any existing table; owner_businesses is referenced by FK
-- only (the Prisma back-relation is virtual and emits no DDL here).

-- CreateTable
CREATE TABLE "owner_data_intakes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "target_domain" TEXT,
    "row_count" INTEGER NOT NULL,
    "validation_status" TEXT NOT NULL,
    "normalization_status" TEXT NOT NULL,
    "mapped_fields" JSONB NOT NULL,
    "unmapped_columns" JSONB NOT NULL,
    "records" JSONB NOT NULL,
    "error_report" JSONB NOT NULL,
    "owner_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_data_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_data_intakes_workspace_id_idx" ON "owner_data_intakes"("workspace_id");
CREATE INDEX "owner_data_intakes_business_id_idx" ON "owner_data_intakes"("business_id");
CREATE INDEX "owner_data_intakes_source_idx" ON "owner_data_intakes"("source");
CREATE INDEX "owner_data_intakes_validation_status_idx" ON "owner_data_intakes"("validation_status");
CREATE INDEX "owner_data_intakes_owner_confirmed_idx" ON "owner_data_intakes"("owner_confirmed");

-- AddForeignKey
ALTER TABLE "owner_data_intakes" ADD CONSTRAINT "owner_data_intakes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
