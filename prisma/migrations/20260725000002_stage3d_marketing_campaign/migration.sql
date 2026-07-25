-- Stage 3D: MarketingCampaign per-campaign records (M010)

CREATE TABLE "marketing_campaigns" (
  "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID          NOT NULL,
  "business_id"  UUID          NOT NULL,
  "name"         VARCHAR(200)  NOT NULL,
  "channel"      VARCHAR(100)  NOT NULL,
  "status"       TEXT          NOT NULL DEFAULT 'DRAFT',
  "budget"       DECIMAL(18,2),
  "spend"        DECIMAL(18,2) DEFAULT 0,
  "leads"        INTEGER       DEFAULT 0,
  "conversions"  INTEGER       DEFAULT 0,
  "revenue"      DECIMAL(18,2) DEFAULT 0,
  "start_date"   TIMESTAMPTZ,
  "end_date"     TIMESTAMPTZ,
  "notes"        TEXT,
  "created_by"   UUID          NOT NULL,
  "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ   NOT NULL,
  CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_campaigns_workspace_business_idx" ON "marketing_campaigns"("workspace_id", "business_id");
CREATE INDEX "marketing_campaigns_workspace_status_idx" ON "marketing_campaigns"("workspace_id", "status");
