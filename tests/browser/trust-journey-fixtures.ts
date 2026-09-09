/**
 * Fixed identifiers/credentials for the TRUST JOURNEY regression scenario.
 *
 * Reproduces the exact human-usability-test failure: a workspace containing a real business
 * ("Trinity Services") alongside multiple acceptance/QA fixture businesses, a SAFE finance
 * diagnosis for Trinity, a stale AT_RISK signal on a different (fixture) business, and zero
 * customer records for Trinity. Shared by the seed (scripts/seed-trust-journey-repro.ts) and
 * tests/browser/trust-journey.spec.ts so the repro is deterministic. Test-only; no production
 * behavior depends on these.
 */

export const TRUST_JOURNEY_OWNER = {
  email: "trust-journey-owner@staging.local",
  password: "password123",
  userId: "60000000-0000-0000-0000-0000000000a1",
};

export const TRUST_JOURNEY_WORKSPACE_ID = "61000000-0000-0000-0000-0000000000a1";

// createBusiness() always generates its own row id (randomUUID()) — these businesses are located
// by name, not a fixed id, both in the seed script's own log output and in the Playwright spec.
export const TRINITY_BUSINESS_NAME = "Trinity Services";
export const FIXTURE_BUSINESS_A_NAME = "OPSIQ Acceptance - laundry - run001";
export const FIXTURE_BUSINESS_B_NAME = "OPSIQ Production Acceptance - 2026-09-01T00:00:00";
