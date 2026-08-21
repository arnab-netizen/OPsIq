-- F-STARTUP-NO-HANDOFF: link a validated, execution-planned Startup session
-- to the real OwnerBusiness it was handed off to.
--
-- Purely additive — no column dropped, no NOT NULL added, no default that
-- rewrites existing rows. Soft FK (no formal Postgres foreign-key
-- constraint), matching the existing business_id convention already used
-- elsewhere in this schema (e.g. owner_compliance_items.business_id).
-- UNIQUE enforces at most one business per session at the DB level — the
-- idempotency backstop for handOffStartupSessionToBusiness()'s
-- optimistic-concurrency guard.
--
-- Backward compatible: OLD code never references "business_id" on
-- owner_startup_session in any generated query, so it is unaffected by this
-- column's existence. Every existing row gets business_id = NULL, which the
-- new handoff logic treats as "not yet handed off" — never as a false match.
ALTER TABLE "owner_startup_session" ADD COLUMN "business_id" UUID;

CREATE UNIQUE INDEX "owner_startup_session_business_id_key" ON "owner_startup_session"("business_id");
