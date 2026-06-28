-- Jarvis 360 Slice 13 — OpsIQ self-evaluation loop. Additive (new table).
CREATE TABLE IF NOT EXISTS "owner_self_evaluation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "recommendation_id" UUID,
  "action_id" UUID,
  "expected_outcome" TEXT NOT NULL,
  "actual_outcome" TEXT,
  "result" TEXT NOT NULL,
  "failure_reason" TEXT,
  "owner_workload_impact" TEXT,
  "reassessment_required" BOOLEAN NOT NULL DEFAULT false,
  "next_reassessment_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_self_evaluation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "owner_self_evaluation_ws_result_idx" ON "owner_self_evaluation" ("workspace_id","result");
