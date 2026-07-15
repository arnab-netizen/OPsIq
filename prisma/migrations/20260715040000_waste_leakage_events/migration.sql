-- Phase 4: Waste / Leakage Detection
-- Persistent event log for detected operational, financial, and quality leakage.
-- Tracks each event through: detected → investigating → confirmed → recovering → verified.
-- Recovery savings are recorded only after owner verification.

CREATE TABLE IF NOT EXISTS "waste_leakage_events" (
  "id"                   UUID           NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         UUID           NOT NULL,
  "category"             TEXT           NOT NULL,
  "source"               TEXT           NOT NULL,
  "amount"               DOUBLE PRECISION,
  "currency"             TEXT           NOT NULL DEFAULT 'USD',
  "evidence_id"          UUID,
  "detected_at"          TIMESTAMPTZ    NOT NULL,
  "status"               TEXT           NOT NULL DEFAULT 'detected',
  "materiality_threshold" DOUBLE PRECISION,
  "confidence_level"     TEXT           NOT NULL DEFAULT 'LOW',
  "recovery_amount"      DOUBLE PRECISION,
  "verified_at"          TIMESTAMPTZ,
  "verified_by"          UUID,
  "dismissal_reason"     TEXT,
  "recurrence_count"     INTEGER        NOT NULL DEFAULT 0,
  "description"          TEXT,
  "created_at"           TIMESTAMPTZ    NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT "waste_leakage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "waste_leakage_events_workspace_id_idx"
  ON "waste_leakage_events"("workspace_id");

CREATE INDEX IF NOT EXISTS "waste_leakage_events_workspace_id_status_idx"
  ON "waste_leakage_events"("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "waste_leakage_events_workspace_id_category_idx"
  ON "waste_leakage_events"("workspace_id", "category");

CREATE INDEX IF NOT EXISTS "waste_leakage_events_workspace_id_detected_at_idx"
  ON "waste_leakage_events"("workspace_id", "detected_at");
