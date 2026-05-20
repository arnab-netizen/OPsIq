import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createShockEvent,
  listShockEventsForEngagement,
} from "@/services/shock-event";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const createShockEventSchema = z.object({
  description: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detectedAt: z.string().datetime(),
});

export const GET = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

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

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const events = await listShockEventsForEngagement(engagementId, session.user.id, workspaceId);
  return Response.json({ events });
});

export const POST = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
    internalOnly: true,
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

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, createShockEventSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "createShockEvent",
    actorId: session.user.id,
    payload: { engagementId, ...body },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await createShockEvent(
      { engagementId, ...body },
      canonicalizeAuthContext({ session, policy }, workspaceId)
    );
    await recordIdempotencyResponse(idempotencyKey, 201, result, auditContext, workspaceId);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
    throw error;
  }
});
