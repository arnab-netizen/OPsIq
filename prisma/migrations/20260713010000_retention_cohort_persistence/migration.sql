-- RetentionEngine BUILT_VOLATILE fix: replace in-memory Map with durable DB persistence.
-- Each row stores one workspace-scoped cohort's retention curve and average monthly churn.
-- monthlyRetention is stored as JSONB (month → retention rate 0–1).
-- No FK to workspaceId (matches the plain-UUID pattern used by OwnerFinancialSnapshot etc.).

CREATE TABLE "retention_cohorts" (
  "id"               UUID        NOT NULL,
  "workspace_id"     UUID        NOT NULL,
  "cohort_month"     TEXT        NOT NULL,
  "cohort_size"      INTEGER,
  "monthly_retention" JSONB      NOT NULL,
  "avg_monthly_churn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "retention_cohorts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retention_cohorts_workspace_id_idx" ON "retention_cohorts"("workspace_id");
CREATE INDEX "retention_cohorts_workspace_id_cohort_month_idx" ON "retention_cohorts"("workspace_id", "cohort_month");
