import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EXECUTION_ACKNOWLEDGED,
    actorId: session.user.id,
    entityType: "engagement",
    entityId: engagementId,
    payload: {
      acknowledgedAt: new Date().toISOString(),
    },
    visibility: "internal",
  });

  return Response.json({
    success: true,
    engagementId,
    acknowledgedAt: new Date().toISOString(),
  });
});
