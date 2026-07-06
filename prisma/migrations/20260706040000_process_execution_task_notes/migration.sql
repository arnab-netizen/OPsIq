-- Interactive execution affordances (PASS 22): add an optional notes column to process_execution_tasks so a
-- reject / block transition can record its reason on the governed row (in addition to the audit event).
-- Additive, backfill-safe, non-destructive.
ALTER TABLE "process_execution_tasks" ADD COLUMN "notes" TEXT;
