-- Complaint/rework event linkage depth pass — minimal per-event operational complaint/rework model.
-- One generic table (eventType = COMPLAINT | REWORK) links accepted proof to the real complaint or
-- rework that contradicted it, so the business impact of bad accepted work becomes measurable.
--
-- Additive, backfill-safe, non-destructive: a brand-new table (no change to existing tables). NOT a
-- CRM/ticketing/refund/customer-profile model. created_at is the server-trusted time; occurred_at is
-- the (untrusted) user-reported time; impact_amount defaults null (no fabricated financial figure).

CREATE TABLE "operational_events" (
  "id"                      UUID NOT NULL,
  "workspace_id"            UUID NOT NULL,
  "event_type"              TEXT NOT NULL,
  "related_proof_id"        UUID,
  "related_action_id"       UUID,
  "business_id"             UUID,
  "category"                TEXT NOT NULL,
  "severity"                TEXT NOT NULL DEFAULT 'MEDIUM',
  "status"                  TEXT NOT NULL DEFAULT 'OPEN',
  "source"                  TEXT NOT NULL DEFAULT 'owner',
  "description"             TEXT NOT NULL,
  "reported_by_user_id"     UUID,
  "occurred_at"             TIMESTAMP(3),
  "resolved_at"             TIMESTAMP(3),
  "outcome"                 TEXT,
  "estimated_impact_amount" DOUBLE PRECISION,
  "impact_currency"         TEXT,
  "impact_confidence"       TEXT NOT NULL DEFAULT 'NEEDS_DATA',
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_events_workspace_id_event_type_idx" ON "operational_events"("workspace_id", "event_type");
CREATE INDEX "operational_events_workspace_id_related_proof_id_idx" ON "operational_events"("workspace_id", "related_proof_id");
