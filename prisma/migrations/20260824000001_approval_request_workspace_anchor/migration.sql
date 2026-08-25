-- SCHEMA-01: add a direct workspace anchor to approval_requests.
--
-- Background: approval_requests (the legacy ApprovalRequest model backing
-- src/services/approval/workflow.ts — distinct from the newer owner_approval_requests /
-- OwnerApprovalRequest table) has never had a workspace_id column. It was classified
-- WORKSPACE_SCOPED_INDIRECT (see docs/remediation/2026-07-04-critical-governance-spine/
-- TENANT_MODEL_CLASSIFICATION.md), scoped only indirectly via operator_item_id ->
-- operator_items.workspace_id, with isolation enforced at the service/route layer rather
-- than the database. This migration closes that DB-level gap.
--
-- Deterministic backfill proof (why this is safe to do in one pass, unlike the
-- client_accounts/lead_records precedent in 20260704120000_client_lead_workspace_anchor,
-- which left workspace_id NULLABLE because some rows genuinely had no derivable workspace):
--
--   1. approval_requests.operator_item_id has been NOT NULL, with a FOREIGN KEY to
--      operator_items(id) ON DELETE CASCADE, since the table was created
--      (20260602_add_approval_workflow/migration.sql). No approval_requests row has ever
--      been able to exist without a valid, still-existing operator_items row — Postgres
--      itself has enforced this for every row's entire lifetime.
--   2. operator_items.workspace_id has been NOT NULL since operator_items was created
--      (20260428_add_asymmetric_signature/migration.sql). No operator_items row has ever
--      been able to exist without a workspace_id.
--
-- Therefore the join below (operator_item_id -> operator_items.id -> workspace_id) is
-- mathematically guaranteed to match 100% of existing approval_requests rows; there is no
-- ambiguous or unmappable row to reason about. The DO block below is a belt-and-braces
-- runtime proof (not a trust assumption) that hard-fails the migration if that invariant
-- is ever somehow violated, before the NOT NULL flip below is allowed to run.

-- 1. Additive phase: nullable column, no default (never silently populated for future rows).
ALTER TABLE "approval_requests" ADD COLUMN "workspace_id" UUID;

-- 2. Backfill every existing row from its parent operator item's workspace.
UPDATE "approval_requests" a
SET "workspace_id" = oi."workspace_id"
FROM "operator_items" oi
WHERE oi."id" = a."operator_item_id"
  AND a."workspace_id" IS NULL;

-- 3. Mandatory proof query: the exact assertion required before the NOT NULL flip is safe.
--    SELECT COUNT(*) FROM "approval_requests" WHERE "workspace_id" IS NULL;  -- must be 0
--    Enforced here as a hard migration failure (not just documentation) so a violated
--    invariant blocks deployment instead of silently shipping a NULL-able escape hatch.
DO $$
DECLARE
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_count FROM "approval_requests" WHERE "workspace_id" IS NULL;
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION
      'approval_request_workspace_anchor: % row(s) in approval_requests have no derivable workspace_id via operator_item_id -> operator_items.workspace_id. Aborting before NOT NULL flip — this should be mathematically impossible given the operator_item_id FK; if it fires, stop and investigate data integrity before re-running.',
      unmapped_count;
  END IF;
END $$;

-- 4. NOT NULL flip — proven safe by the DO block above.
ALTER TABLE "approval_requests" ALTER COLUMN "workspace_id" SET NOT NULL;

-- 5. Index (matches every other workspaceId column in this schema) and FK (matches the
--    client_accounts/lead_records precedent's FK shape) for DB-level referential integrity
--    and query performance.
CREATE INDEX "approval_requests_workspace_id_idx" ON "approval_requests"("workspace_id");

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
