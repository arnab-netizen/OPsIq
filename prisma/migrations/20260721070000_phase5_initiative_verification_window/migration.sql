-- G12: Governed Initiative model
CREATE TABLE "startup_initiatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "idea_id" UUID NOT NULL,
    "objective_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "accountable_owner_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "budget_cents" BIGINT,
    "approval_decision_id" UUID,
    "approval_package_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_initiatives_pkey" PRIMARY KEY ("id")
);

-- G13/G14: Date-bounded Verification Window model
CREATE TABLE "startup_verification_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "initiative_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "idea_id" UUID NOT NULL,
    "window_label" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "success_criteria" JSONB NOT NULL DEFAULT '[]',
    "failure_criteria" JSONB NOT NULL DEFAULT '[]',
    "metrics_to_measure" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "outcome_recorded_at" TIMESTAMP(3),
    "outcome_recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "startup_verification_windows_pkey" PRIMARY KEY ("id")
);

-- Add initiativeId and verificationWindowIds to blueprint
ALTER TABLE "startup_execution_blueprint"
    ADD COLUMN IF NOT EXISTS "initiative_id" UUID,
    ADD COLUMN IF NOT EXISTS "verification_window_ids" JSONB NOT NULL DEFAULT '[]';

-- Foreign keys
ALTER TABLE "startup_initiatives"
    ADD CONSTRAINT "startup_initiatives_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "owner_startup_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "startup_initiatives"
    ADD CONSTRAINT "startup_initiatives_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "startup_idea_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "startup_execution_blueprint"
    ADD CONSTRAINT "startup_execution_blueprint_initiative_id_fkey"
    FOREIGN KEY ("initiative_id") REFERENCES "startup_initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "startup_initiatives_workspace_id_session_id_idx" ON "startup_initiatives"("workspace_id", "session_id");
CREATE INDEX "startup_initiatives_workspace_id_idea_id_idx" ON "startup_initiatives"("workspace_id", "idea_id");
CREATE INDEX "startup_initiatives_workspace_id_status_idx" ON "startup_initiatives"("workspace_id", "status");
CREATE INDEX "startup_verification_windows_workspace_id_initiative_id_idx" ON "startup_verification_windows"("workspace_id", "initiative_id");
CREATE INDEX "startup_verification_windows_workspace_id_session_id_idx" ON "startup_verification_windows"("workspace_id", "session_id");
CREATE INDEX "startup_verification_windows_workspace_id_ends_at_idx" ON "startup_verification_windows"("workspace_id", "ends_at");
