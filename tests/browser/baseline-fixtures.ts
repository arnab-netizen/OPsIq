/**
 * Fixed identifiers/credentials for the PRE-TRAINING realistic-scenario baseline
 * ("Laundry Cash Squeeze + Capacity + Quality Complaint Growth Trap", Kolkata).
 *
 * Shared by the seed (scripts/seed-baseline-laundry.ts) and the baseline Playwright spec so the
 * capture is deterministic and reproducible (same seed → same scenario → comparable before/after).
 * Test-only; no production behavior depends on these.
 */

export const BASELINE_OWNER = {
  email: "baseline-owner@staging.local",
  password: "password123",
  userId: "50000000-0000-0000-0000-0000000000b1",
};

export const BASELINE_WORKSPACE_ID = "51000000-0000-0000-0000-0000000000b1";

/** Staff checklist task that requires proof and has none → completion is server-rejected. */
export const BASELINE_PROOF_TASK_ID = "52000000-0000-0000-0000-0000000000b1";
export const BASELINE_PROOF_REQUIREMENT_ID = "53000000-0000-0000-0000-0000000000b1";

/** Where the spec writes the captured raw output (no secrets/tokens/cookies). */
export const BASELINE_ARTIFACT_DIR = "artifacts/pre-training-baseline";
export const BASELINE_ARTIFACT_FILE = "laundry-kolkata-baseline.json";
