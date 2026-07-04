import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { generateBusinessImpact } from "@/services/business-impact/business-impact.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    // SECURITY: membership-verified workspace + actor-bound engagement access,
    // never a client-supplied x-workspace-id header / query param (which allowed
    // cross-tenant business-impact reads by engagement id). See GAP-TEN-02.
    const workspaceId = ctx.verifiedWorkspaceId;
    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const impact = await generateBusinessImpact(engagementId, ctx.verifiedActorId, workspaceId);

    return {
      success: true,
      data: impact,
    };
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true }
);