import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { NotFoundError } from "@/infra/errors";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(ctx.verifiedActorId, engagementId, ctx.verifiedWorkspaceId);

  try {
    const drift = await detectExecutionDrift(engagementId, ctx.verifiedWorkspaceId);
    return drift;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Engagement")) {
      throw new NotFoundError("Engagement", engagementId);
    }
    throw error;
  }
}, {
  requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW],
  requireWorkspace: true,
});
