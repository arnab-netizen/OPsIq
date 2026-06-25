-- Module 1 — opt-in per-workspace flag: require a BusinessImpactAssessment before
-- a recommendation can be promoted. Additive, idempotent, default false (no change
-- to existing flows).

ALTER TABLE "client_accounts"
  ADD COLUMN IF NOT EXISTS "require_business_impact_assessment" BOOLEAN NOT NULL DEFAULT false;
