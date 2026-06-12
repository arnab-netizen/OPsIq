/**
 * GET /api/owner/command-center?businessId=... — aggregated owner Business
 *     Condition Profile (cross-domain rollup + single prioritized next action).
 *     OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getBusinessCondition(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
