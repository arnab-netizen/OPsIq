-- Add time-to-value tracking fields to operator_items.
-- firstCompletedAt: timestamp when item first reached "done" status.
-- firstPositiveOutcomeAt: timestamp when first positive outcome was recorded.
-- firstWinAchieved: boolean flag set when outcomeDelta > 0 and outcome confirmed.
-- These fields are referenced in the TS domain type and several intelligence
-- routes but were not present in the DB schema, causing silent undefined reads.

ALTER TABLE "operator_items"
  ADD COLUMN IF NOT EXISTS "first_completed_at"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "first_positive_outcome_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "first_win_achieved"        BOOLEAN NOT NULL DEFAULT false;
