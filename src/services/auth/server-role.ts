import type { UserRole } from "@/domain/auth/types";
import { CAPABILITIES } from "@/domain/constants/capabilities";
export { getSession } from "@/services/auth";

/**
 * Resolve the caller's EFFECTIVE legacy UserRole (admin | operator | viewer) for
 * the routes still built on `src/services/auth/access.ts` (canEdit / canApprove /
 * resolveApprovalGrant).
 *
 * SEC-01 fix: this is derived from the REAL workspace PolicyContext — active
 * workspace membership + workspace-scoped role assignments + the capability map —
 * never hardcoded. It fails closed:
 *
 *   - no session, or authenticated but not an active member of any workspace
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
 */
export async function resolveServerRole(): Promise<UserRole | null> {
  // Dynamic import keeps this module free of a static cycle with @/services/auth.
  const { getPolicyContext } = await import("@/services/auth");
  const { hasCapability } = await import("@/policies/capability-check");

  const ctx = await getPolicyContext();
  if (!ctx) {
    // Unauthenticated, or authenticated with no active workspace membership.
    return null;
  }

  if (
    hasCapability(ctx, CAPABILITIES.APPROVAL_DECIDE) ||
    hasCapability(ctx, CAPABILITIES.OVERRIDE_DECIDE)
  ) {
    return "admin";
  }

  if (
    hasCapability(ctx, CAPABILITIES.ACTION_UPDATE) ||
    hasCapability(ctx, CAPABILITIES.DECISION_CLOSE) ||
    hasCapability(ctx, CAPABILITIES.RECOMMENDATION_CREATE)
  ) {
    return "operator";
  }

  return "viewer";
}
