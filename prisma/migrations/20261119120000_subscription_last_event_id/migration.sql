-- Stripe webhook ordering watermark: id of the provider event that last moved the subscription.
-- ADDITIVE ONLY: one nullable column, no default, no backfill, no index, no constraint. Existing
-- rows read NULL, which the webhook ordering rule treats as "no event-time watermark yet" (the
-- pre-existing last_event_timestamp on those rows is a receive time, not a provider event time),
-- so the next provider event applies and records both halves of the watermark.
--
-- Ordering rule (src/services/webhook.service.ts, applied inside the event's transaction):
-- an event applies only if (event.created, event.id) > (last_event_timestamp, last_event_id).

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "last_event_id" TEXT;
