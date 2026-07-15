-- Add unique constraint on (workspace_id, cohort_month) so recordMetrics can safely upsert.
-- Dedup first (keep latest updated_at per pair) in case concurrent CI runs left duplicates.

DELETE FROM "retention_cohorts"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("workspace_id", "cohort_month") "id"
  FROM "retention_cohorts"
  ORDER BY "workspace_id", "cohort_month", "updated_at" DESC
);

ALTER TABLE "retention_cohorts"
  ADD CONSTRAINT "retention_cohorts_workspace_id_cohort_month_key"
  UNIQUE ("workspace_id", "cohort_month");
