-- Migration: Sales Deal Persistence + Revenue Stream Persistence
-- Replaces BUILT_VOLATILE in-memory Maps in SalesPipelineEngine and RevenueEngine.

-- ─── sales_deal_records ───────────────────────────────────────────────────────
CREATE TABLE "sales_deal_records" (
    "id"                   UUID         NOT NULL,
    "workspace_id"         UUID         NOT NULL,
    "company_name"         TEXT         NOT NULL,
    "stage"                TEXT         NOT NULL,
    "value"                DOUBLE PRECISION NOT NULL,
    "currency"             TEXT         NOT NULL DEFAULT 'USD',
    "probability"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expected_close_date"  TIMESTAMP(3) NOT NULL,
    "owner"                TEXT,
    "notes"                TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_deal_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_deal_records_workspace_id_idx" ON "sales_deal_records"("workspace_id");
CREATE INDEX "sales_deal_records_workspace_id_stage_idx" ON "sales_deal_records"("workspace_id", "stage");

-- ─── revenue_stream_records ───────────────────────────────────────────────────
CREATE TABLE "revenue_stream_records" (
    "id"              UUID             NOT NULL,
    "workspace_id"    UUID             NOT NULL,
    "name"            TEXT             NOT NULL,
    "model"           TEXT             NOT NULL DEFAULT 'SUBSCRIPTION',
    "billing_cycle"   TEXT             NOT NULL DEFAULT 'MONTHLY',
    "base_price"      DOUBLE PRECISION NOT NULL,
    "currency"        TEXT             NOT NULL DEFAULT 'USD',
    "volume"          DOUBLE PRECISION,
    "volume_unit"     TEXT,
    "activation_date" TIMESTAMP(3),
    "status"          TEXT             NOT NULL DEFAULT 'DRAFT',
    "created_at"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "revenue_stream_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "revenue_stream_records_workspace_id_idx" ON "revenue_stream_records"("workspace_id");
CREATE INDEX "revenue_stream_records_workspace_id_status_idx" ON "revenue_stream_records"("workspace_id", "status");
