import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateEngagementReport } from "@/services/report-generator";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  await assertEngagementAccess(session.user.id, engagementId);

  const report = await generateEngagementReport(engagementId);
  return Response.json(report);
});
