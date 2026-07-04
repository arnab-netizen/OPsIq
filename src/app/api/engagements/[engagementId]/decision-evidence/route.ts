import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    // SECURITY: membership-verified workspace + actor-bound engagement access,
    // never a client-supplied x-workspace-id header (which allowed cross-tenant
    // decision-evidence reads by engagement id). See GAP-TEN-02.
    const workspaceId = ctx.verifiedWorkspaceId;
    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const evidence = await getDecisionEvidence(engagementId, workspaceId);

    return {
      success: true,
      data: evidence,
    };
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true }
);
