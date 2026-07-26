-- Stage 3E corrective closure: persist email delivery state on alerts.
-- Additive nullable columns — backfill-safe; existing rows receive NULLs.
ALTER TABLE "alerts"
  ADD COLUMN "email_sent_at"    TIMESTAMPTZ,
  ADD COLUMN "email_error"      TEXT,
  ADD COLUMN "resend_message_id" TEXT;
