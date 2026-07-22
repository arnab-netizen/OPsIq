-- Phase 5 defect closure: approval package completeness + blueprint DB-level uniqueness

-- StartupOwnerDecision: add missing approval package snapshot fields
ALTER TABLE "startup_owner_decision"
  ADD COLUMN IF NOT EXISTS "linked_idea_version_id" UUID,
  ADD COLUMN IF NOT EXISTS "linked_business_model_id" UUID,
  ADD COLUMN IF NOT EXISTS "linked_market_sizing_id" UUID,
  ADD COLUMN IF NOT EXISTS "linked_validation_plan_id" UUID,
  ADD COLUMN IF NOT EXISTS "package_hash_sha256" TEXT;

-- StartupContextProfileVersion: add supersession chain
ALTER TABLE "startup_context_profile_version"
  ADD COLUMN IF NOT EXISTS "superseded_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "superseded_at" TIMESTAMPTZ;

-- StartupExecutionBlueprint: enforce at most one blueprint per (session, idea, status)
-- This prevents duplicate ACTIVE blueprints at DB level.
ALTER TABLE "startup_execution_blueprint"
  DROP CONSTRAINT IF EXISTS "startup_execution_blueprint_session_id_idea_id_blueprint_status_key";

ALTER TABLE "startup_execution_blueprint"
  ADD CONSTRAINT "startup_execution_blueprint_session_id_idea_id_blueprint_status_key"
  UNIQUE ("session_id", "idea_id", "blueprint_status");
