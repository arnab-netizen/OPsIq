-- Owner Budget: owner override records + employee/manager budget authority lifecycle.

CREATE TABLE IF NOT EXISTS "owner_budget_overrides" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "reassessment_id" UUID,
    "original_recommendation" TEXT NOT NULL,
    "risk_warning" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "affected_lines" JSONB NOT NULL DEFAULT '[]',
    "expected_consequence" TEXT NOT NULL,
    "review_date" TIMESTAMP(3),
    "actual_outcome" TEXT,
    "outcome_class" TEXT,
    "outcome_note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "owner_budget_overrides_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_budget_overrides_workspace_id_idx" ON "owner_budget_overrides"("workspace_id");
CREATE INDEX IF NOT EXISTS "owner_budget_overrides_workspace_id_business_id_idx" ON "owner_budget_overrides"("workspace_id", "business_id");

CREATE TABLE IF NOT EXISTS "budget_authorities" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "subject_user_id" UUID,
    "subject_role" TEXT,
    "scope_category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NORMAL',
    "reason" TEXT,
    "triggering_evidence" JSONB NOT NULL DEFAULT '{}',
    "review_date" TIMESTAMP(3),
    "restoration_criteria" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_authorities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_authorities_workspace_id_idx" ON "budget_authorities"("workspace_id");
CREATE INDEX IF NOT EXISTS "budget_authorities_workspace_id_business_id_idx" ON "budget_authorities"("workspace_id", "business_id");
