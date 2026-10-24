-- Commercial minimum: Paddle (Merchant of Record) billing columns.
-- Additive only: nullable columns / defaulted boolean + unique indexes. No data rewrite, no drops.
-- Unique indexes allow many NULLs in PostgreSQL, so existing rows are unaffected.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "paddle_price_id" TEXT;
ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "paddle_customer_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paddle_subscription_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "plans_paddle_price_id_key" ON "plans"("paddle_price_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_accounts_paddle_customer_id_key" ON "billing_accounts"("paddle_customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_paddle_subscription_id_key" ON "subscriptions"("paddle_subscription_id");
