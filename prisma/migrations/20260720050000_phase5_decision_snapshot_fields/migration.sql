-- Phase 5: Add complete 21-field approval package snapshot columns to startup_owner_decision.
-- These columns capture the full material context at the time of a GO decision so that
-- checkApprovalStaleness() can detect any post-approval change to evidence, risks, constraints,
-- or policy terms, not just the four versioned artifact IDs tracked by the v1 pipe-delimited hash.

ALTER TABLE startup_owner_decision
  ADD COLUMN IF NOT EXISTS evidence_snapshot_ids  JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS risk_snapshot_ids       JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS constraint_snapshot_ids JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS resource_snapshot_ids   JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS hash_version            INTEGER  NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS policy_version          TEXT     NOT NULL DEFAULT '1';
