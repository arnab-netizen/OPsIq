-- Durable plan-quota reservations (crash recovery for withCapabilityQuota).
-- ADDITIVE ONLY: two NULLABLE columns and three indexes on usage_events. No default, no backfill, no
-- constraint on any existing row: every existing row keeps reservation_id/reservation_entry NULL, which
-- means "plain usage, always final", exactly how it is summed today (SUM(value) per key and period).
-- REQUIRES an owner-authorized production run (CLAUDE.md: Prisma migration on a live database).
--
-- A reservation writes one 'reserve' row (+units, id = reservation_id), zero or more 'settle' rows
-- (value 0, written in the SAME transaction as the business write) and exactly one 'release' row
-- (-unused units). The partial unique index guarantees at most one release per reservation, so a
-- reservation can never be returned twice, whichever of the normal completion path or the expiry
-- sweep finalizes it.

-- AlterTable
ALTER TABLE "usage_events" ADD COLUMN     "reservation_entry" TEXT,
ADD COLUMN     "reservation_id" UUID;

-- CreateIndex
CREATE INDEX "usage_events_reservation_id_reservation_entry_idx" ON "usage_events"("reservation_id", "reservation_entry");

-- CreateIndex
CREATE INDEX "usage_events_reservation_entry_timestamp_idx" ON "usage_events"("reservation_entry", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_one_release_per_reservation" ON "usage_events"("reservation_id") WHERE (reservation_entry = 'release'::text);
