-- Phase 4 depth pass: operating memory versioning, KPI direction/trend/baseline/confidence,
-- OwnerArbitrationOverride table, GoalArbitrationRecord portfolio decisions column.
-- All additive (nullable columns + new table). No backfill required.

-- ─── OperatingMemoryEntry: append-only versioning with supersession ─────────────
ALTER TABLE "operating_memory_entries" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "operating_memory_entries" ADD COLUMN "superseded_by_id" UUID;
ALTER TABLE "operating_memory_entries" ADD COLUMN "superseded_at" TIMESTAMP(3);

-- Drop the old unique constraint (single record per source) so multiple versions can coexist
ALTER TABLE "operating_memory_entries" DROP CONSTRAINT IF EXISTS "operating_memory_entries_workspace_id_memory_type_source_id_key";
-- New unique constraint: one record per (workspace, type, source, version)
ALTER TABLE "operating_memory_entries" ADD CONSTRAINT "operating_memory_entries_ws_type_source_version_key"
  UNIQUE ("workspace_id", "memory_type", "source_id", "version");
-- Add index for current-record lookups (superseded_by_id IS NULL)
CREATE INDEX "operating_memory_entries_workspace_id_memory_type_current_idx"
  ON "operating_memory_entries"("workspace_id", "memory_type")
  WHERE "superseded_by_id" IS NULL;

-- ─── KPIOwnershipRecord: direction, trend, baseline, confidence ──────────────
ALTER TABLE "kpi_ownership_records" ADD COLUMN "direction" TEXT;          -- HIGHER_IS_BETTER | LOWER_IS_BETTER
ALTER TABLE "kpi_ownership_records" ADD COLUMN "trend" TEXT;              -- IMPROVING | STABLE | DECLINING
ALTER TABLE "kpi_ownership_records" ADD COLUMN "baseline_value" DOUBLE PRECISION;
ALTER TABLE "kpi_ownership_records" ADD COLUMN "confidence_level" TEXT;   -- very_high | high | moderate | low | very_low

-- ─── GoalArbitrationRecord: portfolio decisions column ───────────────────────
ALTER TABLE "goal_arbitration_records" ADD COLUMN "portfolio_decisions" JSONB;  -- ObjectivePortfolioDecision[]

-- ─── OwnerArbitrationOverride: owner-chosen override of system recommendation ─
CREATE TABLE "owner_arbitration_overrides" (
  "id"                     UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id"           UUID         NOT NULL,
  "actor_id"               UUID         NOT NULL,
  "overridden_record_id"   UUID         NOT NULL,
  "override_objective_id"  UUID,
  "override_rationale"     TEXT         NOT NULL,
  "decision"               TEXT         NOT NULL DEFAULT 'EXECUTE_NOW',
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "owner_arbitration_overrides_workspace_id_record_idx"
  ON "owner_arbitration_overrides"("workspace_id", "overridden_record_id");
CREATE INDEX "owner_arbitration_overrides_workspace_id_created_idx"
  ON "owner_arbitration_overrides"("workspace_id", "created_at");
