/**
 * Shared fixed identifiers/credentials for the owner-flow E2E lane.
 *
 * Imported by BOTH the seed (`scripts/seed-e2e-owner.ts`) and the Playwright specs so the
 * browser tests can reference deterministically-seeded records (the proof-blocked task, the
 * non-owner member) without scraping IDs out of the UI. Deterministic seed = stable assertions.
 */

export const E2E_OWNER = {
  email: "test1@staging.local",
  password: "password123",
  userId: "10000000-0000-0000-0000-0000000000e2",
};

/** A real member of the SAME workspace who holds NO owner role assignment → lacks owner:view. */
export const E2E_MEMBER = {
  email: "member1@staging.local",
  password: "password123",
  userId: "10000000-0000-0000-0000-0000000000e3",
};

export const E2E_WORKSPACE_ID = "20000000-0000-0000-0000-0000000000e2";

/** A proof-required delegated task with NO accepted proof → completion is server-rejected. */
export const E2E_PROOF_BLOCKED_TASK_ID = "40000000-0000-0000-0000-0000000000e2";
export const E2E_PROOF_REQUIREMENT_ID = "41000000-0000-0000-0000-0000000000e2";
