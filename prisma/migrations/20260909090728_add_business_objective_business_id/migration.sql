-- Additive, zero-risk migration: adds a nullable businessId to business_objectives.
--
-- Root cause this closes: owner-now-view.service.ts's buildBusinessOperatingSystem()
-- loaded active BusinessObjective rows by workspaceId + status ACTIVE only, with no way
-- to scope to one business -- objectives from unrelated businesses in the same workspace
-- could surface on a selected business's Home/Priorities view. This column, following the
-- existing soft-FK businessId convention used elsewhere in this domain (e.g.
-- owner_compliance_item, owner_startup_session) rather than a formal Prisma relation, is
-- what makes that scoping possible.
--
-- business_id = NULL is not "unset" -- it explicitly means a workspace/portfolio-level
-- objective, not tied to one business. No backfill: every existing row defaults to NULL,
-- so no historical row is silently reclassified as belonging to any particular business
-- (see docs/opsiq-governance -- legacy rows are dry-run classified, not mutated, per the
-- accompanying app-code change).

ALTER TABLE "business_objectives" ADD COLUMN "business_id" UUID;

CREATE INDEX "business_objectives_workspace_id_business_id_status_idx" ON "business_objectives"("workspace_id", "business_id", "status");
