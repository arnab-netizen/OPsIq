import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getDeliverablesForEngagement } from "@/services/deliverable";

export const GET = withRequestContext(async (request) => {
  await withAuth();
  const url = new URL(request.url);
  const engagementId = url.searchParams.get("engagementId");

  if (!engagementId) {
    return Response.json(
      { error: "engagementId is required" },
      { status: 400 }
    );
  }

  const deliverables = await getDeliverablesForEngagement(engagementId);
  return Response.json(deliverables);
});
