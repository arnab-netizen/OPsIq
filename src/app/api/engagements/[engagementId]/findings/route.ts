import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { listFindingsForEngagement } from "@/services/findings";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  await withAuth();

  const findings = await listFindingsForEngagement(engagementId);
  return Response.json(findings);
});
