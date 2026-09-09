-- Additive, zero-risk migration: adds a nullable-by-default provenance marker to the six
-- owner-visible-by-default (workspace-wide list/aggregate read), record types createBlueprint()
-- (src/services/owner-strategy/startup-execution-blueprint.service.ts) writes to, mirroring
-- owner_businesses.is_fixture_business. Every existing row defaults to false (real); no backfill,
-- no data movement.
-- See docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.

ALTER TABLE "business_risk_entries" ADD COLUMN "is_fixture_record" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "business_objectives" ADD COLUMN "is_fixture_record" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "kpi_ownership_records" ADD COLUMN "is_fixture_record" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "process_execution_tasks" ADD COLUMN "is_fixture_record" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "constraint_resolution_records" ADD COLUMN "is_fixture_record" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "resource_allocations" ADD COLUMN "is_fixture_record" BOOLEAN NOT NULL DEFAULT false;
