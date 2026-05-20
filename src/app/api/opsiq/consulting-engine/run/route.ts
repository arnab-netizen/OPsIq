import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, canonicalizeAuthContext } from ", { createServiceCapabilityContext }@/lib/auth-guard", { createServiceCapabilityContext };
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
  const authContext = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_CREATE,
  });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, runConsultingEngineSchema);
  parseOrThrow(uuidSchema, body.engagementId);

  const workspaceId = ctx.verifiedWorkspaceId || "";

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "runConsultingPipeline",
    actorId: authContext.session.user.id,
    payload: body,
    workspaceId,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  await assertEngagementAccess(authContext.session.user.id, body.engagementId, workspaceId);

  try {
    const result = await runConsultingPipeline(
      body.engagementId,
      canonicalizeAuthContext(authContext, workspaceId),
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
    await recordIdempotencyResponse(idempotencyKey, statusCode, response);

    return Response.json(response, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

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
      await recordIdempotencyError(idempotencyKey, new Error("Engagement not found", auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown"));
      return Response.json(errorResponse, auditContext, { status: 404 });
    }

    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
    throw error;
  }
});
