-- Additive only. Nothing is rewritten and nothing is dropped.
--
-- 1. Evidence quality (provenance) of a financial snapshot. Nullable: existing rows keep NULL, which means
--    "recorded before provenance existed" (unspecified). It is never read as ACTUAL.
ALTER TABLE "owner_financial_snapshots" ADD COLUMN "evidence_quality" TEXT;
ALTER TABLE "owner_financial_snapshots"
  ADD CONSTRAINT "owner_fin_snapshots_evidence_quality_check"
  CHECK ("evidence_quality" IS NULL OR "evidence_quality" IN ('ACTUAL', 'GOOD_ESTIMATE', 'ROUGH_ESTIMATE'));

-- 2. First-run interactions: improvement requests, skipped progressive questions and first-value feedback
--    (append-only, tenant-scoped). `question_category` makes progressive-question progress durable, so the
--    question limit and "do not ask a skipped question again" survive a reload or a new device.
CREATE TABLE "owner_first_result_interactions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "snapshot_id" UUID,
  "kind" TEXT NOT NULL,
  "rating" TEXT,
  "reason" TEXT,
  "question_category" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_first_result_interactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "owner_first_result_interactions_kind_check" CHECK ("kind" IN ('IMPROVEMENT_REQUESTED', 'FEEDBACK', 'RESULT_VIEWED', 'QUESTION_SKIPPED')),
  CONSTRAINT "owner_first_result_interactions_question_check" CHECK ("question_category" IS NULL OR "kind" IN ('IMPROVEMENT_REQUESTED', 'QUESTION_SKIPPED')),
  CONSTRAINT "owner_first_result_interactions_skip_needs_question_check" CHECK ("kind" <> 'QUESTION_SKIPPED' OR "question_category" IS NOT NULL),
  CONSTRAINT "owner_first_result_interactions_rating_check" CHECK ("rating" IS NULL OR "rating" IN ('USEFUL', 'PARTLY_USEFUL', 'NOT_USEFUL')),
  CONSTRAINT "owner_first_result_interactions_reason_check" CHECK ("reason" IS NULL OR "reason" IN ('WRONG_PRIORITY', 'MISSING_INFORMATION', 'RECOMMENDATION_IMPRACTICAL', 'EXPLANATION_UNCLEAR', 'OTHER'))
);

CREATE UNIQUE INDEX "owner_first_result_interactions_ws_idem_key" ON "owner_first_result_interactions"("workspace_id", "idempotency_key");
CREATE INDEX "owner_first_result_interactions_workspace_id_business_id_ki_idx" ON "owner_first_result_interactions"("workspace_id", "business_id", "kind");

ALTER TABLE "owner_first_result_interactions"
  ADD CONSTRAINT "owner_first_result_interactions_business_id_workspace_id_fkey"
  FOREIGN KEY ("business_id", "workspace_id") REFERENCES "owner_businesses"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
