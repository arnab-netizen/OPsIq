-- Phase 5: add material_claim to startup_evidence_record for conflict detection
ALTER TABLE "startup_evidence_record"
  ADD COLUMN IF NOT EXISTS "material_claim" TEXT;

-- Phase 5: StartupExecutionPlan — Initiative → Ordered Task Execution Plan
CREATE TABLE IF NOT EXISTS "startup_execution_plans" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "workspace_id"      UUID        NOT NULL,
  "session_id"        UUID        NOT NULL,
  "idea_id"           UUID        NOT NULL,
  "initiative_id"     UUID        NOT NULL,
  "blueprint_id"      UUID        NOT NULL,
  "owner_decision_id" UUID        NOT NULL,
  "status"            TEXT        NOT NULL DEFAULT 'DRAFT',
  "plan_version"      INTEGER     NOT NULL DEFAULT 1,
  "tasks"             JSONB       NOT NULL DEFAULT '[]',
  "milestones"        JSONB       NOT NULL DEFAULT '[]',
  "approved_at"       TIMESTAMPTZ,
  "approved_by"       UUID,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by"        UUID        NOT NULL,
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "startup_execution_plans_initiative_id_key"
  ON "startup_execution_plans" ("initiative_id");

CREATE INDEX IF NOT EXISTS "startup_execution_plans_workspace_session_idx"
  ON "startup_execution_plans" ("workspace_id", "session_id");

CREATE INDEX IF NOT EXISTS "startup_execution_plans_workspace_idea_idx"
  ON "startup_execution_plans" ("workspace_id", "idea_id");

CREATE INDEX IF NOT EXISTS "startup_execution_plans_workspace_blueprint_idx"
  ON "startup_execution_plans" ("workspace_id", "blueprint_id");
