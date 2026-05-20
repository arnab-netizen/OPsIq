import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from ", { createServiceCapabilityContext }@/lib/auth-guard", { createServiceCapabilityContext };
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rootCauseEngine } from "@/services/diagnostic-core/root-cause-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { z } from "zod/v4";

const rootCauseSchema = z.object({
  engagementId: z.string().uuid("Valid engagement ID required"),
  workspaceId: z.string().uuid("Valid workspace ID required"),
  metrics: z.record(z.string(), z.number()),
  observations: z.array(z.string()).min(2, "At least 2 observations required"),
  timeline: z.record(z.string(), z.string().transform(s => new Date(s))),
});

export const POST = withEnforcementFull(async (request) => {
  const authContext = await withAuth({
    capability: CAPABILITIES.DIAGNOSIS_READ,
    internalOnly: false,
  });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, rootCauseSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "analyzeRootCause",
    authContext,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    logger.info("Root cause analysis requested", {
      engagementId: body.engagementId,
      workspaceId: body.workspaceId,
      userId: authContext.session.user.id,
    });

    const result = await rootCauseEngine.analyzeRootCause(
      body.engagementId,
      body.workspaceId,
      body.metrics,
      body.observations,
      body.timeline
    );

    if (!result) {
      await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for root cause analysis", auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown"));
      return Response.json(
        { error: "Analysis failed: insufficient or contradictory data" }, auditContext, { status: 400 }
      );
    }

    logger.info("Root cause analysis complete", {
      analysisId: result.analysisId,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, auditContext, unknown>, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
    logger.error("Root cause analysis error", auditContext, { error: err.message });
    return Response.json(
      { error: err.message || "Root cause analysis failed" },
      { status: 500 }
    );
  }
});
