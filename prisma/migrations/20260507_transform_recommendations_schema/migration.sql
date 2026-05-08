-- Complete Recommendation table schema alignment to Phase 0-3
-- This is a comprehensive transformation migration

-- Step 1: Drop all foreign key constraints and indexes from the original table
DO $$
BEGIN
  -- Drop constraints that reference recommendations
  EXECUTE 'ALTER TABLE IF EXISTS "actions" DROP CONSTRAINT IF EXISTS "actions_recommendation_id_fkey"';

  -- Drop constraints on recommendations that reference other tables
  EXECUTE 'ALTER TABLE "recommendations" DROP CONSTRAINT IF EXISTS "recommendations_engagement_id_fkey"';
  EXECUTE 'ALTER TABLE "recommendations" DROP CONSTRAINT IF EXISTS "recommendations_stage_id_fkey"';
  EXECUTE 'ALTER TABLE "recommendations" DROP CONSTRAINT IF EXISTS "recommendations_finding_id_fkey"';

  -- Drop all indexes on recommendations table
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_engagement_id_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_stage_id_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_finding_id_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_status_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_priority_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_archived_at_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_engagement_id_status_idx"';
  EXECUTE 'DROP INDEX IF EXISTS "recommendations_finding_id_status_idx"';
END $$;

-- Step 2: Drop the primary key on the old table (this also drops the index)
ALTER TABLE "recommendations" DROP CONSTRAINT IF EXISTS "recommendations_pkey";

-- Step 3: Rename the original recommendations table
ALTER TABLE "recommendations" RENAME TO "recommendations_legacy";

-- Step 4: Create new recommendations table with Phase 0-3 schema
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "engagement_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "finding_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rationale" TEXT,
    "priority" TEXT NOT NULL,
    "estimated_impact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "evidence_validation_score" INTEGER,
    "reliability_level" TEXT,
    "kpi_health_score" INTEGER,
    "kpi_risk_level" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rollback_plan" TEXT,
    "constraints_considered" JSONB,
    "confidence_level" TEXT,
    "expires_at" TIMESTAMP(3),
    "is_ai_proposal" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- Step 5: Create indexes
CREATE INDEX "recommendations_engagement_id_idx" ON "recommendations"("engagement_id");
CREATE INDEX "recommendations_status_idx" ON "recommendations"("status");
CREATE INDEX "recommendations_priority_idx" ON "recommendations"("priority");
CREATE INDEX "recommendations_workspace_id_idx" ON "recommendations"("workspace_id");
CREATE UNIQUE INDEX "recommendations_finding_id_title_key" ON "recommendations"("finding_id", "title") WHERE "finding_id" IS NOT NULL;

-- Step 6: Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_engagement_id_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_engagement_id_fkey"
    FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_workspace_id_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_finding_id_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_finding_id_fkey"
    FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_approved_by_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'recommendations_created_by_fkey'
  ) THEN
    ALTER TABLE "recommendations"
    ADD CONSTRAINT "recommendations_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 7: Drop the legacy table (after verifying no active references)
-- This will be done in a follow-up migration once data is migrated if needed
-- For now, keep it for reference
