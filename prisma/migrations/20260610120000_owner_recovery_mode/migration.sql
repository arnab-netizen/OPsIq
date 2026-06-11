-- Owner-Only Recovery Mode: business intake, metric snapshots, recovery cycles,
-- findings, actions, and before/after verification. Self-contained tables.

-- CreateTable
CREATE TABLE "owner_businesses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "location" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "operating_model" TEXT,
    "b2c_supported" BOOLEAN NOT NULL DEFAULT true,
    "b2b_supported" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_metric_snapshots" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION,
    "total_costs" DOUBLE PRECISION,
    "gross_profit" DOUBLE PRECISION,
    "net_profit" DOUBLE PRECISION,
    "order_count" DOUBLE PRECISION,
    "kg_processed" DOUBLE PRECISION,
    "pieces_processed" DOUBLE PRECISION,
    "b2c_revenue" DOUBLE PRECISION,
    "b2b_revenue" DOUBLE PRECISION,
    "new_customers" DOUBLE PRECISION,
    "repeat_customers" DOUBLE PRECISION,
    "dormant_contacted" DOUBLE PRECISION,
    "average_order_value" DOUBLE PRECISION,
    "discount_amount" DOUBLE PRECISION,
    "refund_amount" DOUBLE PRECISION,
    "rewash_count" DOUBLE PRECISION,
    "complaint_count" DOUBLE PRECISION,
    "receivables" DOUBLE PRECISION,
    "staff_cost" DOUBLE PRECISION,
    "rent_cost" DOUBLE PRECISION,
    "utilities_cost" DOUBLE PRECISION,
    "material_cost" DOUBLE PRECISION,
    "delivery_cost" DOUBLE PRECISION,
    "marketing_spend" DOUBLE PRECISION,
    "campaign_conversions" DOUBLE PRECISION,
    "average_turnaround_hours" DOUBLE PRECISION,
    "staff_productivity" DOUBLE PRECISION,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_cycles" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "previous_cycle_id" UUID,
    "cycle_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "health_status" TEXT NOT NULL,
    "health_score" DOUBLE PRECISION NOT NULL,
    "summary" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_findings" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_metric" TEXT NOT NULL,
    "current_value" DOUBLE PRECISION,
    "comparison_value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "severity" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "why_it_matters" TEXT NOT NULL,
    "impact_estimate" DOUBLE PRECISION,
    "impact_currency" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "verification_metric" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_actions" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "finding_id" UUID,
    "business_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assigned_to_role" TEXT NOT NULL,
    "assigned_to_user_id" UUID,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "due_at" TIMESTAMP(3),
    "expected_outcome" TEXT NOT NULL,
    "metric_to_move" TEXT NOT NULL,
    "baseline_value" DOUBLE PRECISION,
    "target_value" DOUBLE PRECISION,
    "verification_window_days" INTEGER NOT NULL,
    "effort" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "completion_criteria" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'up',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completion_notes" TEXT,
    "actual_outcome" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_verifications" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "baseline_value" DOUBLE PRECISION NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL,
    "after_value" DOUBLE PRECISION,
    "direction" TEXT NOT NULL DEFAULT 'up',
    "verification_window_days" INTEGER NOT NULL,
    "actual_movement" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "evidence" TEXT,
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_businesses_workspace_id_idx" ON "owner_businesses"("workspace_id");

-- CreateIndex
CREATE INDEX "owner_businesses_workspace_id_is_active_idx" ON "owner_businesses"("workspace_id", "is_active");

-- CreateIndex
CREATE INDEX "owner_metric_snapshots_business_id_idx" ON "owner_metric_snapshots"("business_id");

-- CreateIndex
CREATE INDEX "owner_metric_snapshots_workspace_id_idx" ON "owner_metric_snapshots"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_metric_snapshots_business_id_period_start_period_end_key" ON "owner_metric_snapshots"("business_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "recovery_cycles_business_id_idx" ON "recovery_cycles"("business_id");

-- CreateIndex
CREATE INDEX "recovery_cycles_workspace_id_idx" ON "recovery_cycles"("workspace_id");

-- CreateIndex
CREATE INDEX "recovery_findings_cycle_id_idx" ON "recovery_findings"("cycle_id");

-- CreateIndex
CREATE INDEX "recovery_findings_workspace_id_idx" ON "recovery_findings"("workspace_id");

-- CreateIndex
CREATE INDEX "recovery_actions_cycle_id_idx" ON "recovery_actions"("cycle_id");

-- CreateIndex
CREATE INDEX "recovery_actions_workspace_id_idx" ON "recovery_actions"("workspace_id");

-- CreateIndex
CREATE INDEX "recovery_actions_status_idx" ON "recovery_actions"("status");

-- CreateIndex
CREATE INDEX "recovery_verifications_action_id_idx" ON "recovery_verifications"("action_id");

-- CreateIndex
CREATE INDEX "recovery_verifications_workspace_id_idx" ON "recovery_verifications"("workspace_id");

-- AddForeignKey
ALTER TABLE "owner_metric_snapshots" ADD CONSTRAINT "owner_metric_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cycles" ADD CONSTRAINT "recovery_cycles_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cycles" ADD CONSTRAINT "recovery_cycles_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "owner_metric_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cycles" ADD CONSTRAINT "recovery_cycles_previous_cycle_id_fkey" FOREIGN KEY ("previous_cycle_id") REFERENCES "recovery_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_findings" ADD CONSTRAINT "recovery_findings_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "recovery_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "recovery_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "recovery_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_verifications" ADD CONSTRAINT "recovery_verifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "recovery_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
