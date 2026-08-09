-- Add outcome, calibration, and execution attribution fields to operator_items.
-- These fields are referenced throughout services (calibration, badges, insights,
-- segmentation) and the domain type but were never migrated into the DB table.
-- Writes in execution-service.ts were silently dropped via (tx: any) casts.

ALTER TABLE "operator_items"
  ADD COLUMN IF NOT EXISTS "decision_type"             TEXT,
  ADD COLUMN IF NOT EXISTS "problem_type"              TEXT,
  ADD COLUMN IF NOT EXISTS "baseline_value"            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "projected_without_action"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "outcome_delta"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "decision_accuracy"         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "decision_error"            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "executed_at"               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "executed_by"               UUID;
