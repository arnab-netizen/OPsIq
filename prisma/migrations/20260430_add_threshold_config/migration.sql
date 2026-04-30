-- CreateTable threshold_configs
CREATE TABLE "threshold_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "confidence_min_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "low_confidence_value_threshold" DOUBLE PRECISION NOT NULL DEFAULT 3000000,
    "low_confidence_failure_rate_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.40,
    "rule_block_value_threshold" DOUBLE PRECISION NOT NULL DEFAULT 5000000,
    "false_positive_rate_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "block_count_threshold" INTEGER NOT NULL DEFAULT 50,
    "override_failure_rate_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "override_failure_value_threshold" DOUBLE PRECISION NOT NULL DEFAULT 2000000,
    "failure_count_threshold" INTEGER NOT NULL DEFAULT 10,
    "missing_data_value_threshold" DOUBLE PRECISION NOT NULL DEFAULT 4000000,
    "pending_age_threshold" INTEGER NOT NULL DEFAULT 604800000,
    "field_missing_rate_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "confidence_change_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "approval_rate_change_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "block_rate_change_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "drift_severity_low" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "drift_severity_medium" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "drift_severity_high" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "stalled_pipeline_threshold" DOUBLE PRECISION NOT NULL DEFAULT 10000000,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threshold_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "threshold_configs_workspace_id_key" ON "threshold_configs"("workspace_id");

-- CreateIndex
CREATE INDEX "threshold_configs_workspace_id_idx" ON "threshold_configs"("workspace_id");
