import type { UserRole } from "@/domain/auth/types";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { hasCapability, type PolicyContext } from "@/policies/capability-check";
export { getSession } from "@/services/auth";

/**
 * Derive the caller's EFFECTIVE legacy UserRole (admin | operator | viewer) for
 * the routes still built on `src/services/auth/access.ts` (canEdit / canApprove /
 * resolveApprovalGrant), from an already-verified PolicyContext.
 *
 * SEC-01: derived from the REAL workspace PolicyContext — active workspace
 * membership + workspace-scoped role assignments + the capability map — never
 * hardcoded. It fails closed:
 *
 *   - no policy context (no session, or not an active member of any workspace)
 *       → null  (callers translate this to 401/unauthorized)
 *   - member holding approve/override authority (APPROVAL_DECIDE / OVERRIDE_DECIDE)
 *       → "admin"   (canApprove + canEdit)
 *   - member holding edit authority (ACTION_UPDATE / DECISION_CLOSE / RECOMMENDATION_CREATE)
 *       → "operator" (canEdit, cannot approve)
 *   - member with neither (view-only, or a membership with no role assignment)
 *       → "viewer"  (least privilege)
 *
 * The legacy role is intentionally computed from capabilities (not role-name
 * heuristics) so it can never drift from the real policy layer that the canonical
 * routes enforce.
 *
 * Inside a `withCanonicalEnforcement` handler pass `ctx.policy`: the wrapper's verified
 * policy is the request's only auth source once the session snapshot is finalized, and a
 * fresh getPolicyContext() there is refused by the shadow-read enforcer
 * (SHADOW_AUTH_READ_DETECTED → 500).
 */
export function deriveServerRole(policy: PolicyContext | null | undefined): UserRole | null {
  if (!policy) {
    return null;
  }

  if (
    hasCapability(policy, CAPABILITIES.APPROVAL_DECIDE) ||
    hasCapability(policy, CAPABILITIES.OVERRIDE_DECIDE)
  ) {
    return "admin";
  }

  if (
    hasCapability(policy, CAPABILITIES.ACTION_UPDATE) ||
    hasCapability(policy, CAPABILITIES.DECISION_CLOSE) ||
    hasCapability(policy, CAPABILITIES.RECOMMENDATION_CREATE)
  ) {
    return "operator";
  }

  return "viewer";
}

/**
 * Resolve the legacy UserRole by fetching the caller's PolicyContext from the session.
 * For code OUTSIDE a canonical handler only; canonical handlers use
 * `deriveServerRole(ctx.policy)` (see above).
 */
export async function resolveServerRole(): Promise<UserRole | null> {
  // Dynamic import keeps this module free of a static cycle with @/services/auth.
  const { getPolicyContext } = await import("@/services/auth");
  return deriveServerRole(await getPolicyContext());
}
