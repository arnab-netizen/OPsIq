import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const workspaceId = ctx.verifiedWorkspaceId;
    const evidence = await getDecisionEvidence(engagementId, workspaceId);

    return {
      success: true,
      data: evidence,
    };
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
