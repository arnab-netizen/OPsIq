-- AlterTable
ALTER TABLE "operator_items" ADD COLUMN "actual_outcome_value" DOUBLE PRECISION,
ADD COLUMN "outcome_notes" TEXT,
ADD COLUMN "started_at" TIMESTAMP(3),
ADD COLUMN "completed_at" TIMESTAMP(3),
ADD COLUMN "execution_status" TEXT NOT NULL DEFAULT 'not_started';

-- Update status comment to reflect new values
COMMENT ON COLUMN "operator_items"."status" IS 'pending | in_progress | done | failed';

-- CreateIndex
CREATE INDEX "operator_items_priority_score_idx" ON "operator_items"("priorityScore");

-- CreateIndex
CREATE INDEX "operator_items_execution_status_idx" ON "operator_items"("execution_status");
