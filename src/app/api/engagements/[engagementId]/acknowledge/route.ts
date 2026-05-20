import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { createServiceCapabilityContext } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const idempotencyKey = ctx.request?.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  const workspaceId = ctx.verifiedWorkspaceId;

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "acknowledgeEngagement",
    actorId: ctx.verifiedActorId,
    workspaceId,
    payload: { engagementId },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  const capabilityContext = createServiceCapabilityContext({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  try {
    const engagement = await db.engagement.findUnique({
      where: { id: engagementId, workspaceId },
    });

    if (!engagement) throw new NotFoundError("Engagement", engagementId);

    const acknowledgedAt = new Date().toISOString();

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EXECUTION_ACKNOWLEDGED,
      actorId: ctx.verifiedActorId,
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
    await recordIdempotencyResponse(idempotencyKey, 200, result, capabilityContext, workspaceId);
    return Response.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, capabilityContext, workspaceId);
    throw error;
  }
}, {
  requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE],
  requireWorkspace: true,
});