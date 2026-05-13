import { getEngagementOutcomes } from "@/services/outcome/outcome.service";
import type { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withEnforcementFull(async (_request, context, params) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const result = await getEngagementOutcomes(engagementId);

  return Response.json({
    success: true,
    data: result,
  });
});
