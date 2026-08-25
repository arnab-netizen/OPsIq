-- SCHEMA-01: add a direct workspace anchor to override_records.
--
-- Background: override_records (the OverrideRecord model backing
-- src/services/override/operator-override.service.ts) has never had a workspace_id column. It was
-- classified WORKSPACE_SCOPED_INDIRECT (see docs/remediation/2026-07-04-critical-governance-spine/
-- TENANT_MODEL_CLASSIFICATION.md), scoped only indirectly via operator_item_id ->
-- operator_items.workspace_id, with isolation enforced at the service layer (recordOperatorOverride()
-- loads the parent OperatorItem via a workspace-scoped findFirst before ever creating an override row)
-- rather than the database. This migration closes that DB-level gap, mirroring the precedent PR that
-- closed the identical classification for ApprovalRequest
-- (prisma/migrations/20260824000001_approval_request_workspace_anchor).
--
-- Deterministic backfill proof (why this is safe to do in one pass):
--
--   1. override_records.operator_item_id has been NOT NULL, with a FOREIGN KEY to
--      operator_items(id) ON DELETE CASCADE, since the table was created
--      (20260428_add_phase_1_5_persistence/migration.sql). No override_records row has ever been
--      able to exist without a valid, still-existing operator_items row — Postgres itself has
--      enforced this for every row's entire lifetime.
--   2. operator_items.workspace_id has been NOT NULL since operator_items was created
--      (20260428_add_asymmetric_signature/migration.sql). No operator_items row has ever been able
--      to exist without a workspace_id.
--
-- Therefore the join below (operator_item_id -> operator_items.id -> workspace_id) is
-- mathematically guaranteed to match 100% of existing override_records rows; there is no
-- ambiguous or unmappable row to reason about. The DO block below is a belt-and-braces runtime
-- proof (not a trust assumption) that hard-fails the migration if that invariant is ever somehow
-- violated, before the NOT NULL flip below is allowed to run.

-- 1. Additive phase: nullable column, no default (never silently populated for future rows).
ALTER TABLE "override_records" ADD COLUMN "workspace_id" UUID;

-- 2. Backfill every existing row from its parent operator item's workspace.
UPDATE "override_records" o
SET "workspace_id" = oi."workspace_id"
FROM "operator_items" oi
WHERE oi."id" = o."operator_item_id"
  AND o."workspace_id" IS NULL;

-- 3. Mandatory proof query: the exact assertion required before the NOT NULL flip is safe.
--    SELECT COUNT(*) FROM "override_records" WHERE "workspace_id" IS NULL;  -- must be 0
--    Enforced here as a hard migration failure (not just documentation) so a violated invariant
--    blocks deployment instead of silently shipping a NULL-able escape hatch.
DO $$
DECLARE
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM "override_records" WHERE "workspace_id" IS NULL;
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION
      'override_record_workspace_anchor: % row(s) in override_records have no derivable workspace_id via operator_item_id -> operator_items.workspace_id. Aborting before NOT NULL flip — this should be mathematically impossible given the operator_item_id FK; if it fires, stop and investigate data integrity before re-running.',
      unmapped_count;
  END IF;
END $$;

-- 4. NOT NULL flip — proven safe by the DO block above.
ALTER TABLE "override_records" ALTER COLUMN "workspace_id" SET NOT NULL;

-- 5. Index and FK.
CREATE INDEX "override_records_workspace_id_idx" ON "override_records"("workspace_id");

ALTER TABLE "override_records" ADD CONSTRAINT "override_records_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
