-- Migration: snapshot_amendment
-- Adds versioning/amendment support to owner_financial_snapshots.
-- Removes the single-version-per-period unique constraint and replaces it
-- with a version-aware unique, enabling owners to amend missing data in
-- an already-recorded snapshot without falsifying period provenance.

ALTER TABLE "owner_financial_snapshots"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "superseded_by_id" UUID,
  ADD COLUMN "amendment_reason" TEXT,
  ADD COLUMN "changed_fields" JSONB,
  ADD COLUMN "amended_by_actor_id" UUID;

-- Drop the old single-version constraint that blocked amendments
ALTER TABLE "owner_financial_snapshots"
  DROP CONSTRAINT "owner_financial_snapshots_business_id_period_start_period_end_key";

-- Add version-aware uniqueness: one row per (business, period, version number)
ALTER TABLE "owner_financial_snapshots"
  ADD CONSTRAINT "owner_financial_snapshots_business_id_period_start_period_end_version_key"
  UNIQUE ("business_id", "period_start", "period_end", "version");

-- Index for efficient current-version lookups (WHERE superseded_by_id IS NULL)
CREATE INDEX "owner_financial_snapshots_business_id_superseded_by_id_idx"
  ON "owner_financial_snapshots"("business_id", "superseded_by_id");
