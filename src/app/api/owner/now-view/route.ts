/**
 * GET /api/owner/now-view?businessId=... — Real-Time 360° Owner Now View (Module 41).
 *     Returns the top 3 owner actions, actions to avoid, what changed since last
 *     check, missing data, beginner explanation, step-by-step guidance, confidence
 *     cap, and rollback triggers. OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getOwnerNowView(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
