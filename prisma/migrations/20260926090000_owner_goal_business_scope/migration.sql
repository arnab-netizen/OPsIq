-- Business-scoped owner goals (additive).
--
-- New goals belong to exactly one business (business_id). Existing rows keep every value they
-- have (id, status, currency, target type, dates, history) and receive business_id = NULL, which
-- marks them as EXPLICIT legacy workspace goals. No row is assigned to a business here and no
-- currency or target type is converted — reassignment is an owner-confirmed action in the app.

-- Preflight (fail closed): the unique indexes below allow at most one ACTIVE legacy workspace goal
-- per workspace. createGoal()'s old update-then-insert could race and leave two ACTIVE rows. If any
-- workspace has more than one, abort rather than choosing which goal survives; an owner must
-- resolve it (see docs/deployment/PRODUCTION_RELEASE_PROCEDURE.md, "Failed migration").
DO $$
DECLARE
  duplicate_workspaces integer;
BEGIN
  SELECT count(*) INTO duplicate_workspaces
  FROM (
    SELECT workspace_id FROM "owner_goals" WHERE status = 'ACTIVE' GROUP BY workspace_id HAVING count(*) > 1
  ) d;
  IF duplicate_workspaces > 0 THEN
    RAISE EXCEPTION 'owner_goals preflight failed: % workspace(s) have more than one ACTIVE goal. Resolve them explicitly before applying this migration; no goal is chosen automatically.', duplicate_workspaces;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "owner_goals" ADD COLUMN     "business_id" UUID,
ADD COLUMN     "superseded_by_id" UUID;

-- CreateIndex
CREATE INDEX "owner_goals_workspace_id_business_id_status_idx" ON "owner_goals"("workspace_id", "business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "owner_goals_one_active_per_business" ON "owner_goals"("business_id") WHERE ((status = 'ACTIVE'::text) AND (business_id IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "owner_goals_one_active_legacy_per_workspace" ON "owner_goals"("workspace_id") WHERE ((status = 'ACTIVE'::text) AND (business_id IS NULL));

-- AddForeignKey
ALTER TABLE "owner_goals" ADD CONSTRAINT "owner_goals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "owner_businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
