/**
 * Deterministic smoke test identity.
 *
 * Smoke tests must use fixed, well-known identifiers rather than
 * timestamp-derived identifiers. Timestamp-based IDs create permanent
 * production DB rows on every run with no cleanup path.
 *
 * Usage in smoke scripts:
 *   import { SMOKE_EMAIL, SMOKE_WORKSPACE_NAME } from "@/lib/smoke-identity";
 *
 * The actual UUIDs for user and workspace are supplied via env vars so they
 * can be seeded once and reused across runs. The email is deterministic.
 *
 * Prevention: this module exports a validator used by the prevention test to
 * reject scripts that use timestamp-based identities.
 */

export const SMOKE_EMAIL = "opsiq-smoke@internal.opsiq.dev";
export const SMOKE_WORKSPACE_NAME = "OpsIQ Smoke Workspace";
export const SMOKE_BUSINESS_NAME = "Smoke Test Business";

/** Regex that identifies a timestamp-based smoke email (production contamination risk). */
export const TIMESTAMP_SMOKE_EMAIL_PATTERN = /opsiq-smoke\+\d+@/;

/** True when running in a smoke/test context (OPSIQ_SMOKE=true env var). */
export function isSmokeContext(): boolean {
  return process.env.OPSIQ_SMOKE === "true";
}

/** Validate that a smoke email is deterministic, not timestamp-based. */
export function assertDeterministicSmokeIdentity(email: string): void {
  if (TIMESTAMP_SMOKE_EMAIL_PATTERN.test(email)) {
    throw new Error(
      `S7-DC7: Timestamp-based smoke email detected: "${email}". ` +
        "Use SMOKE_EMAIL from @/lib/smoke-identity instead. " +
        "Timestamp emails create permanent production rows with no cleanup path."
    );
  }
}
