-- Dynamic Budget, Capital Allocation & Profit Governance (Owner Mode)
-- Workspace-scoped budget structure, spend governance, and immutable plan snapshots.

CREATE TABLE IF NOT EXISTS "budget_periods" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "approved_budget" DOUBLE PRECISION,
    "cash_reserve_target" DOUBLE PRECISION,
    "statutory_reserve_required" DOUBLE PRECISION,
    "owner_goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_periods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_periods_workspace_id_idx" ON "budget_periods"("workspace_id");
CREATE INDEX IF NOT EXISTS "budget_periods_workspace_id_business_id_idx" ON "budget_periods"("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "budget_periods_workspace_id_business_id_status_idx" ON "budget_periods"("workspace_id", "business_id", "status");

CREATE TABLE IF NOT EXISTS "budget_lines" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "planned_amount" DOUBLE PRECISION NOT NULL,
    "owner_role" TEXT,
    "approval_threshold" DOUBLE PRECISION,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_lines_workspace_id_idx" ON "budget_lines"("workspace_id");
CREATE INDEX IF NOT EXISTS "budget_lines_workspace_id_business_id_idx" ON "budget_lines"("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "budget_lines_workspace_id_period_id_idx" ON "budget_lines"("workspace_id", "period_id");

CREATE TABLE IF NOT EXISTS "spend_entries" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_id" UUID,
    "budget_line_id" UUID,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'requested',
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_ref" TEXT,
    "obligation_kind" TEXT,
    "due_in_days" INTEGER,
    "requested_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "is_new_vendor" BOOLEAN NOT NULL DEFAULT false,
    "vendor_bank_changed" BOOLEAN NOT NULL DEFAULT false,
    "proof_status" TEXT,
    "risk_level" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spend_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "spend_entries_workspace_id_idx" ON "spend_entries"("workspace_id");
CREATE INDEX IF NOT EXISTS "spend_entries_workspace_id_business_id_idx" ON "spend_entries"("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "spend_entries_workspace_id_business_id_state_idx" ON "spend_entries"("workspace_id", "business_id", "state");

CREATE TABLE IF NOT EXISTS "budget_reassessments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_id" UUID,
    "trigger_event_id" TEXT NOT NULL,
    "trigger_class" TEXT NOT NULL,
    "change_field" TEXT,
    "mode" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "top_constraint" TEXT NOT NULL,
    "next_best_action" TEXT NOT NULL,
    "decision_type" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_reassessments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "budget_reassessments_workspace_id_business_id_trigger_event_id_key" ON "budget_reassessments"("workspace_id", "business_id", "trigger_event_id");
CREATE INDEX IF NOT EXISTS "budget_reassessments_workspace_id_idx" ON "budget_reassessments"("workspace_id");
CREATE INDEX IF NOT EXISTS "budget_reassessments_workspace_id_business_id_idx" ON "budget_reassessments"("workspace_id", "business_id");

CREATE TABLE IF NOT EXISTS "budget_plan_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_id" UUID,
    "reassessment_id" UUID,
    "version" INTEGER NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "change_reason" TEXT,
    "plan" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_plan_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_plan_snapshots_workspace_id_idx" ON "budget_plan_snapshots"("workspace_id");
CREATE INDEX IF NOT EXISTS "budget_plan_snapshots_workspace_id_business_id_idx" ON "budget_plan_snapshots"("workspace_id", "business_id");
CREATE INDEX IF NOT EXISTS "budget_plan_snapshots_workspace_id_business_id_is_current_idx" ON "budget_plan_snapshots"("workspace_id", "business_id", "is_current");
