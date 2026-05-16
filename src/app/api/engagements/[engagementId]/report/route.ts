import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateEngagementReport } from "@/services/report-generator";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { workspaceId: true },
    });
    if (!engagement) {
      throw new NotFoundError("Engagement", engagementId);
    }

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, engagement.workspaceId);

    const report = await generateEngagementReport(engagementId, engagement.workspaceId);
    return report;
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
