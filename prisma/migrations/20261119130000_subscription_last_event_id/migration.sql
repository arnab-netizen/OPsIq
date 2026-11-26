-- Stripe webhook ordering watermark: id of the provider event that last moved the subscription.
-- ADDITIVE ONLY: one nullable column, no default, no backfill, no index, no constraint. Existing
-- rows read NULL, which the webhook ordering rule treats as "no event-time watermark yet" (the
-- pre-existing last_event_timestamp on those rows is a receive time, not a provider event time),
-- so the next provider event applies and records both halves of the watermark.
--
-- Ordering rule (src/domain/billing/stripe-subscription-ordering.ts, applied inside the event's
-- transaction under a row lock). Events for the subscription the row is bound to are ordered by
-- the key (event.created, terminal, event.id) against (last_event_timestamp, terminal(status),
-- last_event_id): a terminal result (canceled / incomplete_expired) wins a same-second tie
-- against a non-terminal one, and the event id only breaks ties within the same class. A
-- same-second tie against a watermark written by the other billing provider goes to the stored
-- provider. Events for a different Stripe subscription are decided by the binding key
-- (subscription created, subscription id), not by this watermark (see the next migration).

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "last_event_id" TEXT;
