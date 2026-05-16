import { getEngagementOutcomes } from "@/services/outcome/outcome.service";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const result = await getEngagementOutcomes(engagementId);

    return {
      success: true,
      data: result,
    };
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
