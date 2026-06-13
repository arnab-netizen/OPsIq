-- Module 7 SOP, Process & Execution Accountability: sop-specific persistence
-- (additive). Creates 5 new tables (snapshot, cycle, finding, action,
-- verification) that reuse owner_businesses via FK. ADDITIVE ONLY: no ALTER/DROP
-- on any existing recovery_*, owner_metric_snapshots, owner_finance_*,
-- owner_cashflow_*, owner_sales_*, or owner_operations_* table; owner_businesses
-- is unchanged (the Prisma back-relations are virtual and emit no DDL here).

-- CreateTable
CREATE TABLE "owner_sop_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "business_model_type" TEXT,
    "industry_template" TEXT,
    "actions_assigned" DOUBLE PRECISION,
    "actions_completed" DOUBLE PRECISION,
    "actions_verified" DOUBLE PRECISION,
    "actions_overdue" DOUBLE PRECISION,
    "actions_disputed" DOUBLE PRECISION,
    "actions_reassigned" DOUBLE PRECISION,
    "repeated_failures" DOUBLE PRECISION,
    "proof_required" DOUBLE PRECISION,
    "proof_provided" DOUBLE PRECISION,
    "recurring_processes" DOUBLE PRECISION,
    "documented_sops" DOUBLE PRECISION,
    "notes" TEXT,
    "data_confidence_score" DOUBLE PRECISION NOT NULL,
    "missing_critical_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_sop_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_sop_cycles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "health_score" DOUBLE PRECISION NOT NULL,
    "risk_score" DOUBLE PRECISION NOT NULL,
    "opportunity_score" DOUBLE PRECISION NOT NULL,
    "data_confidence_score" DOUBLE PRECISION NOT NULL,
    "execution_state" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_sop_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_sop_findings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "finding_type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source_metric" TEXT NOT NULL,
    "source_value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "impact_score" DOUBLE PRECISION NOT NULL,
    "urgency_score" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL,
    "missing_data" JSONB NOT NULL,
    "verification_metric" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_sop_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_sop_actions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "finding_id" UUID,
    "recommendation_code" TEXT NOT NULL,
    "finding_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner_role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "priority_score" DOUBLE PRECISION NOT NULL,
    "effort_score" DOUBLE PRECISION NOT NULL,
    "expected_impact_score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verification_metric" TEXT NOT NULL,
    "verification_method" TEXT NOT NULL,
    "expected_timeframe_days" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3),
    "assigned_to" UUID,
    "completed_at" TIMESTAMP(3),
    "completion_notes" TEXT,
    "completion_evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_sop_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_sop_verifications" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "verification_metric" TEXT NOT NULL,
    "before_value" DOUBLE PRECISION,
    "after_value" DOUBLE PRECISION,
    "target_direction" TEXT NOT NULL,
    "target_value" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_sop_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_sop_snapshots_business_period_key" ON "owner_sop_snapshots"("business_id", "period_start", "period_end");
CREATE INDEX "owner_sop_snapshots_workspace_id_idx" ON "owner_sop_snapshots"("workspace_id");
CREATE INDEX "owner_sop_snapshots_business_id_idx" ON "owner_sop_snapshots"("business_id");
CREATE INDEX "owner_sop_snapshots_period_end_idx" ON "owner_sop_snapshots"("period_end");

-- CreateIndex
CREATE UNIQUE INDEX "owner_sop_cycles_business_id_sequence_number_key" ON "owner_sop_cycles"("business_id", "sequence_number");
CREATE INDEX "owner_sop_cycles_workspace_id_idx" ON "owner_sop_cycles"("workspace_id");
CREATE INDEX "owner_sop_cycles_business_id_idx" ON "owner_sop_cycles"("business_id");
CREATE INDEX "owner_sop_cycles_snapshot_id_idx" ON "owner_sop_cycles"("snapshot_id");

-- CreateIndex
CREATE INDEX "owner_sop_findings_workspace_id_idx" ON "owner_sop_findings"("workspace_id");
CREATE INDEX "owner_sop_findings_business_id_idx" ON "owner_sop_findings"("business_id");
CREATE INDEX "owner_sop_findings_cycle_id_idx" ON "owner_sop_findings"("cycle_id");
CREATE INDEX "owner_sop_findings_code_idx" ON "owner_sop_findings"("code");
CREATE INDEX "owner_sop_findings_severity_idx" ON "owner_sop_findings"("severity");

-- CreateIndex
CREATE INDEX "owner_sop_actions_workspace_id_idx" ON "owner_sop_actions"("workspace_id");
CREATE INDEX "owner_sop_actions_business_id_idx" ON "owner_sop_actions"("business_id");
CREATE INDEX "owner_sop_actions_cycle_id_idx" ON "owner_sop_actions"("cycle_id");
CREATE INDEX "owner_sop_actions_status_idx" ON "owner_sop_actions"("status");
CREATE INDEX "owner_sop_actions_priority_score_idx" ON "owner_sop_actions"("priority_score");

-- CreateIndex
CREATE INDEX "owner_sop_verifications_workspace_id_idx" ON "owner_sop_verifications"("workspace_id");
CREATE INDEX "owner_sop_verifications_business_id_idx" ON "owner_sop_verifications"("business_id");
CREATE INDEX "owner_sop_verifications_action_id_idx" ON "owner_sop_verifications"("action_id");
CREATE INDEX "owner_sop_verifications_status_idx" ON "owner_sop_verifications"("status");

-- AddForeignKey
ALTER TABLE "owner_sop_snapshots" ADD CONSTRAINT "owner_sop_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_cycles" ADD CONSTRAINT "owner_sop_cycles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_cycles" ADD CONSTRAINT "owner_sop_cycles_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "owner_sop_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_findings" ADD CONSTRAINT "owner_sop_findings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_findings" ADD CONSTRAINT "owner_sop_findings_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "owner_sop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_actions" ADD CONSTRAINT "owner_sop_actions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_actions" ADD CONSTRAINT "owner_sop_actions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "owner_sop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_actions" ADD CONSTRAINT "owner_sop_actions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "owner_sop_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_verifications" ADD CONSTRAINT "owner_sop_verifications_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sop_verifications" ADD CONSTRAINT "owner_sop_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "owner_sop_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
