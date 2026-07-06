-- Structured External Opportunity Intake (depth pass) — a live owner/manager/system-submitted opportunity
-- signal that feeds the External Opportunity Intelligence loop + Opportunity Operating Layer, instead of
-- only DB-sim/injected data. Controlled STRUCTURED intake only: OpsIQ never scrapes, contacts anyone,
-- auto-submits a tender, or spends. Additive, backfill-safe, non-destructive: a brand-new table (no change
-- to existing tables). Qualitative bands are the submitter's own assessment; numeric value/exposure are
-- stored for the record only and are never turned into profit/impact. UNIQUE (workspace_id, idempotency_key)
-- makes repeated submission idempotent.

CREATE TABLE "external_opportunity_signals" (
  "id"                          UUID NOT NULL,
  "workspace_id"                UUID NOT NULL,
  "idempotency_key"             TEXT NOT NULL,
  "dedupe_key"                  TEXT NOT NULL,
  "raw_signal_type"             TEXT NOT NULL,
  "source_name"                 TEXT,
  "source_channel"              TEXT,
  "source_ref"                  TEXT,
  "submitted_by_user_id"        UUID,
  "submitted_by_role"           TEXT,
  "raw_description"             TEXT NOT NULL,
  "extracted_business_need"     TEXT,
  "target_customer_segment"     TEXT,
  "location_context"            TEXT,
  "deadline_at"                 TIMESTAMP(3),
  "tender_or_procurement_value" DOUBLE PRECISION,
  "eligibility_requirements"    TEXT,
  "compliance_requirements"     TEXT,
  "estimated_cash_exposure"     DOUBLE PRECISION,
  "cash_exposure_band"          TEXT NOT NULL DEFAULT 'UNKNOWN',
  "relevance_band"              TEXT NOT NULL DEFAULT 'MODERATE',
  "owner_workload_band"         TEXT NOT NULL DEFAULT 'LOW',
  "owner_workload_notes"        TEXT,
  "has_unit_economics"          BOOLEAN NOT NULL DEFAULT false,
  "source_quality"              TEXT NOT NULL DEFAULT 'UNKNOWN',
  "required_documents"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missing_documents"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "discovered_at"               TIMESTAMP(3),
  "last_verified_at"            TIMESTAMP(3),
  "stale_after_days"            INTEGER,
  "evidence_refs"               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missing_data"                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "initial_status"              TEXT NOT NULL,
  "classification"              TEXT NOT NULL,
  "status"                      TEXT NOT NULL DEFAULT 'ACTIVE',
  "submitted_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_opportunity_signals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_opportunity_signals_workspace_id_idempotency_key_key" ON "external_opportunity_signals"("workspace_id", "idempotency_key");
CREATE INDEX "external_opportunity_signals_workspace_id_status_idx" ON "external_opportunity_signals"("workspace_id", "status");
