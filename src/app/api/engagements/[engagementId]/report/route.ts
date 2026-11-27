import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateEngagementReport } from "@/services/report-generator";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { hasInternalAccess } from "@/policies/capability-check";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const engagement = await db.engagement.findUnique({
      where: { id: engagementId, workspaceId: ctx.verifiedWorkspaceId as string },
      select: { workspaceId: true, visibility: true },
    });
    // A caller with no internal role sees only client-visible engagements (the same rule as GET /api/engagements/[id]);
    // an internal-only engagement is indistinguishable from a missing one.
    const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
    if (!engagement || (!internalAccess && engagement.visibility !== "client_visible")) {
      throw new NotFoundError("Engagement", engagementId);
    }

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, engagement.workspaceId);

    const report = await generateEngagementReport(engagementId, engagement.workspaceId, {
      clientVisibleOnly: !internalAccess,
    });
    return report;
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
