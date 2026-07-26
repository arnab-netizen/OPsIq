-- Stage 3G: Email delivery state machine (FSM) for alerts.
-- Replaces the emailSentAt-as-claim-flag anti-pattern with an explicit state field
-- and supporting columns for atomic claim/lease, attempt tracking, and crash recovery.

-- Create enum type for email delivery FSM states
CREATE TYPE "email_delivery_status_enum" AS ENUM (
  'PENDING',
  'CLAIMED',
  'SENT',
  'FAILED',
  'SKIPPED'
);

-- Add FSM columns
ALTER TABLE "alerts"
  ADD COLUMN "email_delivery_status" "email_delivery_status_enum" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "email_claimed_at"       TIMESTAMPTZ,
  ADD COLUMN "email_claim_expires_at" TIMESTAMPTZ,
  ADD COLUMN "email_last_attempt_at"  TIMESTAMPTZ,
  ADD COLUMN "email_attempt_count"    INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows:
-- 1. SENT: email was confirmed delivered (sent_at set, no error)
UPDATE "alerts"
  SET "email_delivery_status" = 'SENT'
  WHERE "email_sent_at" IS NOT NULL AND "email_error" IS NULL;

-- 2. FAILED: delivery was attempted but failed (old design set sent_at pre-send)
--    Clear email_sent_at because under the new model it means "provider confirmed" only.
UPDATE "alerts"
  SET "email_delivery_status" = 'FAILED',
      "email_sent_at" = NULL
  WHERE "email_sent_at" IS NOT NULL AND "email_error" IS NOT NULL;

-- 3. SKIPPED: in_app channel — email was never applicable
UPDATE "alerts"
  SET "email_delivery_status" = 'SKIPPED'
  WHERE "channel" = 'in_app' AND "email_delivery_status" = 'PENDING';

-- Index to efficiently find claimable records (worker polling)
CREATE INDEX "alerts_email_delivery_status_idx"
  ON "alerts" ("email_delivery_status", "email_claim_expires_at")
  WHERE "email_delivery_status" IN ('PENDING', 'CLAIMED');
