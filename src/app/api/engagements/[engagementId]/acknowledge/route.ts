import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withEnforcementFull(async (request, context, params) => {
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
    throw new ForbiddenError("Unauthorized");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "acknowledgeEngagement",
    actorId: session.user.id,
    payload: { engagementId },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const engagement = await db.engagement.findUnique({
      where: { id: engagementId, workspaceId },
    });

    if (!engagement) throw new NotFoundError("Engagement", engagementId);

    const acknowledgedAt = new Date().toISOString();

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXECUTION_ACKNOWLEDGED,
      actorId: session.user.id,
      entityType: "engagement",
      entityId: engagementId,
      payload: {
        acknowledgedAt,
      },
      visibility: "internal",
    });

    const result = {
      success: true,
      engagementId,
      acknowledgedAt,
    };
    await recordIdempotencyResponse(idempotencyKey, 200, result);
    return Response.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
