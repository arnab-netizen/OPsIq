-- Deep Action-System Linkage: persist budget advisory actions as owner execution tasks.
CREATE TABLE IF NOT EXISTS "owner_budget_actions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_id" UUID,
    "reassessment_id" UUID,
    "plan_snapshot_id" UUID,
    "source_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "decision_type" TEXT NOT NULL,
    "accountable_role" TEXT NOT NULL,
    "assigned_to" UUID,
    "due_at" TIMESTAMP(3),
    "review_in_days" INTEGER NOT NULL,
    "required_proof" TEXT NOT NULL,
    "expected_financial_impact" TEXT NOT NULL,
    "verification_method" TEXT NOT NULL,
    "escalation_path" TEXT NOT NULL,
    "kill_rule" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "completed_at" TIMESTAMP(3),
    "completion_notes" TEXT,
    "completion_evidence" JSONB,
    "outcome_class" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "owner_budget_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "owner_budget_actions_workspace_id_business_id_source_key_key" ON "owner_budget_actions"("workspace_id", "business_id", "source_key");
CREATE INDEX IF NOT EXISTS "owner_budget_actions_workspace_id_idx" ON "owner_budget_actions"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_budget_actions_workspace_id_business_id_idx" ON "owner_budget_actions"("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "owner_budget_actions_status_idx" ON "owner_budget_actions"("status");
DO $$ BEGIN
  ALTER TABLE "owner_budget_actions" ADD CONSTRAINT "owner_budget_actions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
