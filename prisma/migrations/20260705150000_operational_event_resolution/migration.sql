-- Operational event resolution / aging depth pass — resolution provenance columns.
--
-- Adds two nullable columns to the existing operational_events table so a complaint/rework event can
-- be resolved/dismissed with a note and an attributed resolver. The status vocabulary
-- (OPEN | IN_REVIEW | RESOLVED | DISMISSED | DUPLICATE) is carried in the existing TEXT `status`
-- column and needs no schema change. Aging (age / unresolved-age / overdue) is computed from the
-- server-trusted `created_at`, not stored.
--
-- Additive, backfill-safe, non-destructive: both new columns are nullable with no default and no
-- change to existing columns/indexes. Pre-existing rows read back NULL (equivalent to "never resolved").

ALTER TABLE "operational_events" ADD COLUMN "resolved_by_user_id" UUID;
ALTER TABLE "operational_events" ADD COLUMN "resolution_note" TEXT;
