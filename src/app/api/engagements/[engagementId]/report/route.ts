import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateEngagementReport } from "@/services/report-generator";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { workspaceId: true },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  await assertEngagementAccess(session.user.id, engagementId, engagement.workspaceId);

  const report = await generateEngagementReport(engagementId, engagement.workspaceId);
  return Response.json(report);
});
