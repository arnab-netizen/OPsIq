import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { calculateImpactDelta } from "@/services/business-impact/impact-delta.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withRequestContext(async (_request, context) => {
  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);

  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_VIEW,
  });

  // Fetch action to get engagementId
  const action = await db.action.findUnique({
    where: { id: actionId },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  const delta = await calculateImpactDelta(action.engagementId, actionId, session.user.id);

  return Response.json({
    success: true,
    data: delta,
  });
});
