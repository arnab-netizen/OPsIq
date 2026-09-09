-- Additive, zero-risk migration: adds a nullable-by-default provenance marker to
-- owner_business, mirroring the existing is_active column pattern. Every existing
-- row defaults to false (real business); no backfill, no data movement.
-- See docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.

ALTER TABLE "owner_businesses" ADD COLUMN "is_fixture_business" BOOLEAN NOT NULL DEFAULT false;
