-- Phase 4: Cost attribution + opportunity-objective links
-- Additive ALTER on existing tables only. No data loss, no backfill required.

ALTER TABLE "budget_lines"
  ADD COLUMN IF NOT EXISTS "linked_objective_id" UUID;

ALTER TABLE "spend_entries"
  ADD COLUMN IF NOT EXISTS "linked_objective_id" UUID;

ALTER TABLE "external_opportunity_signals"
  ADD COLUMN IF NOT EXISTS "linked_objective_id" UUID;
