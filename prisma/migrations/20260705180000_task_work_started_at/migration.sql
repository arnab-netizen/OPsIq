-- Timing write-path population depth pass — persist a trusted work-start timestamp on the task so the
-- fast-completion signal can measure a real duration from live operations (not only seeded data).
--
-- Additive, backfill-safe, non-destructive: one NULLABLE column, no default. Legacy rows stay null and
-- the fast-completion evaluator treats a null work-start as TIMING_MISSING (fail-visible) rather than
-- fabricating a start time. Set server-side when a task first transitions to IN_PROGRESS.

ALTER TABLE "delegated_tasks" ADD COLUMN "work_started_at" TIMESTAMP(3);
