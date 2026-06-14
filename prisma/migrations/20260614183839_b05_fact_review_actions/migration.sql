-- B05: Fact Review Actions
-- Tracks owner approvals, corrections, rejections, and "unknown" marks on extracted facts
-- Used by B05 Owner Data Review/Correction UI to maintain audit trail and support corrections

CREATE TABLE "fact_review_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intake_id" UUID NOT NULL,
    "fact_id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "correction_reason" TEXT,
    "actor_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_review_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fact_review_actions_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "owner_data_intakes" ("id") ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX "fact_review_actions_intake_id_idx" ON "fact_review_actions"("intake_id");
CREATE INDEX "fact_review_actions_fact_id_idx" ON "fact_review_actions"("fact_id");
CREATE INDEX "fact_review_actions_workspace_intake_idx" ON "fact_review_actions"("workspace_id", "intake_id");
CREATE INDEX "fact_review_actions_action_idx" ON "fact_review_actions"("action");
