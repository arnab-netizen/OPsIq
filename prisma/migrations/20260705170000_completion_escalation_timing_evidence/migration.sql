-- Completion / escalation timing-evidence depth pass — persist minimum trusted timing evidence so
-- two previously BLOCKED_BY_DATA risk signals can be produced from real persisted data:
--   • SUSPICIOUS_FAST_COMPLETION  — needs a trusted work-start timestamp paired with submitted_at.
--   • MANAGER_IGNORES_ESCALATION  — needs trusted escalation acknowledgement timing.
--
-- Additive, backfill-safe, non-destructive: every new column is NULLABLE with no default. Legacy rows
-- stay null and the evaluators treat null as TIMING_MISSING / unacknowledged (fail-visible) rather than
-- fabricating a timestamp. No existing column, index, or row is altered.

ALTER TABLE "proofs"      ADD COLUMN "work_started_at"  TIMESTAMP(3);

ALTER TABLE "escalations" ADD COLUMN "acknowledged_at"  TIMESTAMP(3);
ALTER TABLE "escalations" ADD COLUMN "acknowledged_by"  UUID;
