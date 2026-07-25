-- Stage 3B: CustomerRecord model (M002) + OperationalEvent customerRecordId (M003)

-- CustomerRecord: B2C/B2B customer master record scoped to workspace + business
CREATE TABLE "customer_records" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id"        UUID NOT NULL,
    "business_id"         UUID NOT NULL,
    "name"                VARCHAR(200) NOT NULL,
    "email"               VARCHAR(254),
    "phone"               VARCHAR(50),
    "segment"             VARCHAR(100),
    "last_purchase_date"  TIMESTAMP(3),
    "ltv"                 DECIMAL(18,2),
    "tags"                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes"               TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_records_workspace_id_business_id_idx"
    ON "customer_records"("workspace_id", "business_id");

CREATE INDEX "customer_records_workspace_id_segment_idx"
    ON "customer_records"("workspace_id", "segment");

-- M003: link OperationalEvent to CustomerRecord (nullable — not all events have a customer)
ALTER TABLE "operational_events"
    ADD COLUMN "customer_record_id" UUID;
