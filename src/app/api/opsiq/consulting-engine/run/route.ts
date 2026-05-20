import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";

const runConsultingEngineSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID format"),
});

export const POST = withEnforcementFull(async (request) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_CREATE,
  });

  const nextRequest = request as NextRequest;
  const workspaceIdHeader = nextRequest.headers.get("x-workspace-id");
  if (!workspaceIdHeader) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, runConsultingEngineSchema);
  parseOrThrow(uuidSchema, body.engagementId);

  const workspaceId = workspaceIdHeader;

  const auditContext = createServiceCapabilityContext({
    capability: CAPABILITIES.RECOMMENDATION_CREATE,
  });

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "runConsultingPipeline",
    actorId: session.user.id,
    workspaceId,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  await assertEngagementAccess(session.user.id, body.engagementId, workspaceId);

  try {
    const result = await runConsultingPipeline(
      body.engagementId,
      canonicalizeAuthContext({ session, policy }, workspaceId),
      workspaceId
    );

    const response = {
      success: result.status === "SUCCESS",
      status: result.status,
      data: {
        decisionMemo: result.decisionMemo,
        recommendations: result.recommendations,
        actions: result.actions,
      },
      warnings: result.warnings,
    };

    const statusCode = result.status === "SUCCESS" ? 200 : 400;
    await recordIdempotencyResponse(idempotencyKey, statusCode, response, auditContext, workspaceId);

    return Response.json(response, { status: statusCode });
  } catch (error) {
    const message = getSafeErrorMessage(error);

    if (
      message.includes("not found") ||
      message.includes("not exist") ||
      message.includes("does not exist")
    ) {
      const errorResponse = {
        success: false,
        status: "ERROR",
        error: {
          message: "Engagement not found",
          code: "ENGAGEMENT_NOT_FOUND",
        },
        data: { decisionMemo: null, recommendations: [], actions: [] },
        warnings: [],
      };
      const err = new Error("Engagement not found");
      await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
      return Response.json(errorResponse, { status: 404 });
    }

    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
    throw error;
  }
});
