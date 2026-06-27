/**
 * GET /api/owner/budget/guidance?businessId=... — current Dynamic Budget owner
 *     guidance (mode, top risk, next best action, confidence, pending decisions,
 *     signals, linked actions). OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBudgetGuidance } from "@/services/owner-budget/budget.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) return { error: "businessId is required" };
    return getBudgetGuidance(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
