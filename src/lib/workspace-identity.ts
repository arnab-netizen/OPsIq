/**
 * WORKSPACE IDENTITY SEPARATION (Stage A7.7 DC-01 Remediation)
 *
 * Two distinct identity types prevent conflation of caller-supplied with
 * membership-verified workspace identity at the TypeScript type level:
 *
 *   ClaimedWorkspaceId  — raw string from x-workspace-id header; caller-controlled;
 *                         NEVER used for auth decisions, DB scoping, tier lookup,
 *                         rate-limit keying, idempotency scoping, or audit attribution.
 *
 *   VerifiedWorkspaceId — derived ONLY from authenticated DB membership; produced
 *                         exclusively by withCanonicalEnforcement at STEP 1.5;
 *                         the sole legal key for all protected operations.
 *
 * Construction rules:
 *   - Only withCanonicalEnforcement may call asVerifiedWorkspaceId()
 *   - All other code calls claimWorkspaceId() and keeps the ClaimedWorkspaceId brand
 *   - claimedIdForLog() sanitises and length-limits before logging
 */

declare const _claimedBrand: unique symbol;
declare const _verifiedBrand: unique symbol;

/** Caller-supplied x-workspace-id header value. Not trusted for any auth operation. */
export type ClaimedWorkspaceId = string & { readonly [_claimedBrand]: "ClaimedWorkspaceId" };

/** DB-membership-verified workspace identity. Produced only by withCanonicalEnforcement. */
export type VerifiedWorkspaceId = string & { readonly [_verifiedBrand]: "VerifiedWorkspaceId" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLAIM_LENGTH = 64;

/**
 * Wrap a raw header value as a ClaimedWorkspaceId.
 * Validates UUID format and enforces max length. Returns null on invalid input
 * so callers fail closed rather than propagating malformed claims.
 */
export function claimWorkspaceId(raw: string | null | undefined): ClaimedWorkspaceId | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.slice(0, MAX_CLAIM_LENGTH).trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed as ClaimedWorkspaceId;
}

/**
 * Produce a safe, length-limited representation of a claim for log/trace output.
 * Never use the raw claim in auth decisions — use only for diagnostic correlation.
 */
export function claimedIdForLog(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "<absent>";
  const trimmed = raw.slice(0, 36).trim();
  return UUID_RE.test(trimmed) ? trimmed : "<invalid-format>";
}

/**
 * INTERNAL — called ONLY by withCanonicalEnforcement after DB membership proof.
 * Do NOT call from middleware, services, routes, or test helpers.
 * The brand is the guarantee: only code that has completed STEP 1.5 (DB membership
 * lookup with session-validated userId) may produce a VerifiedWorkspaceId.
 */
export function asVerifiedWorkspaceId(dbDerivedId: string): VerifiedWorkspaceId {
  if (!dbDerivedId || !UUID_RE.test(dbDerivedId)) {
    throw new Error(
      `asVerifiedWorkspaceId: received non-UUID value "${dbDerivedId}" — this indicates a programming error in withCanonicalEnforcement`
    );
  }
  return dbDerivedId as VerifiedWorkspaceId;
}
