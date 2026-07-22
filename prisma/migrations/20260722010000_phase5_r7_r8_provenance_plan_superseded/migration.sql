-- R7: Add provenance fields to BusinessRiskEntry and ConstraintResolutionRecord
-- Distinguishes blueprint-created artifacts from independently-created records
-- so queryCurrentSnapshotIds can exclude blueprint artifacts from hash computation.

ALTER TABLE "business_risk_entries"
  ADD COLUMN IF NOT EXISTS "origin_blueprint_id" UUID,
  ADD COLUMN IF NOT EXISTS "origin_type" TEXT;

CREATE INDEX IF NOT EXISTS "business_risk_entries_workspace_id_origin_blueprint_id_idx"
  ON "business_risk_entries"("workspace_id", "origin_blueprint_id");

ALTER TABLE "constraint_resolution_records"
  ADD COLUMN IF NOT EXISTS "origin_blueprint_id" UUID,
  ADD COLUMN IF NOT EXISTS "origin_type" TEXT;

CREATE INDEX IF NOT EXISTS "constraint_resolution_records_workspace_id_origin_blueprint_id_idx"
  ON "constraint_resolution_records"("workspace_id", "origin_blueprint_id");

-- R8: Add SUPERSEDED status tracking to StartupExecutionPlan
-- Allows atomic supersession on reapproval — superseded plans cannot authorize further actions.

ALTER TABLE "startup_execution_plans"
  ADD COLUMN IF NOT EXISTS "superseded_by_id" UUID;
