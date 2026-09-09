-- Additive, zero-risk migration: adds a nullable-by-default provenance marker to
-- owner_startup_session, mirroring owner_businesses.is_fixture_business. A real human
-- usability test found production acceptance-tooling startup sessions ("OPsIQ Production
-- Acceptance - ...") mixed into an ordinary owner's own Startup planning history -- this
-- model was overlooked by the original ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md pass. Every
-- existing row defaults to false (real); no backfill, no data movement.
-- See docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.

ALTER TABLE "owner_startup_session" ADD COLUMN "is_fixture_business" BOOLEAN NOT NULL DEFAULT false;
