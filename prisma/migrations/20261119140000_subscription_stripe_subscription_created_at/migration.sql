-- Stripe subscription binding key: Stripe's own created time of the subscription the row is bound
-- to (subscriptions.stripe_subscription_id).
-- ADDITIVE ONLY: one nullable column, no default, no backfill, no index, no constraint. Existing
-- rows read NULL ("binding key unknown"); the next event for the bound subscription records it.
--
-- Rule (src/domain/billing/stripe-subscription-ordering.ts, applied inside the event's transaction
-- under a row lock): an event for a Stripe subscription other than the bound one rebinds the row
-- only if its key (subscription created, subscription id) is greater than the bound key, i.e. the
-- newest subscription is authoritative whatever the delivery order. Events for an older
-- subscription are acknowledged, audited as ignored, and never touch the row.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "stripe_subscription_created_at" TIMESTAMP(6);
