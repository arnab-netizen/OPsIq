import { withRequestContext } from "../../../lib/api-handler.js";
import { withAuth } from "../../../lib/auth-guard.js";
import { CAPABILITIES } from "../../../domain/constants/capabilities.js";
import { generateReport } from "../../../services/report-generator.js";

export const GET = withRequestContext(async (request, { params }) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_READ,
  });

  const engagementId = params.engagementId;
  const report = await generateReport(engagementId, session.user.id);

  return Response.json(report, { status: 200 });
});
