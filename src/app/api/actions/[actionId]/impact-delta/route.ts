import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { calculateImpactDelta } from "@/services/business-impact/impact-delta.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withEnforcementFull(async (request, context, params) => {
  const { actionId } = params;
  parseOrThrow(uuidSchema, actionId);

  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_VIEW,
  });

  // Get workspace ID from request
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id") ||
                       nextRequest.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required" },
      { status: 400 }
    );
  }

  // Fetch action to get engagementId (scoped by workspace)
  const action = await db.action.findUnique({
    where: { id: actionId, workspaceId },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  const delta = await calculateImpactDelta(action.engagementId, actionId, session.user.id, workspaceId);

  return Response.json({
    success: true,
    data: delta,
  });
});
