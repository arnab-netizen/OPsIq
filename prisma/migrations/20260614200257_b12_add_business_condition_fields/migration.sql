-- B12: Add fields required for evidence-backed business condition profile evaluation
-- Adds: workspace_id (denormalized for fast scoping), health scores, risk/strength arrays, diagnosis linkage

ALTER TABLE "business_condition_profiles" ADD COLUMN "workspace_id" UUID;
ALTER TABLE "business_condition_profiles" ADD COLUMN "condition_score" INTEGER DEFAULT 50;
ALTER TABLE "business_condition_profiles" ADD COLUMN "owner_health_score" INTEGER DEFAULT 50;
ALTER TABLE "business_condition_profiles" ADD COLUMN "team_health_score" INTEGER DEFAULT 50;
ALTER TABLE "business_condition_profiles" ADD COLUMN "customer_health_score" INTEGER DEFAULT 50;
ALTER TABLE "business_condition_profiles" ADD COLUMN "financial_health_score" INTEGER DEFAULT 50;
ALTER TABLE "business_condition_profiles" ADD COLUMN "risk_factors" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "business_condition_profiles" ADD COLUMN "strengths" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "business_condition_profiles" ADD COLUMN "diagnosis_id" UUID;

-- Populate workspace_id from engagement relationship (backfill)
UPDATE "business_condition_profiles" bcp
SET "workspace_id" = e."workspace_id"
FROM "engagements" e
WHERE bcp."engagement_id" = e."id";

-- Make workspace_id NOT NULL after backfill
ALTER TABLE "business_condition_profiles" ALTER COLUMN "workspace_id" SET NOT NULL;

-- Add foreign key constraint for workspace isolation
-- (optional: can validate workspace_id matches engagement's workspace_id)

-- Add indexes for fast queries
CREATE INDEX "idx_business_condition_profiles_workspace_id" ON "business_condition_profiles"("workspace_id");
CREATE INDEX "idx_business_condition_profiles_diagnosis_id" ON "business_condition_profiles"("diagnosis_id");
