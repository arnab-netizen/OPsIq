import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rootCauseEngine } from "@/services/diagnostic-core/root-cause-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { RuntimeError } from "@/runtime/runtime-errors";
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
      await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for root cause analysis"));
      return Response.json(
        { error: "Analysis failed: insufficient or contradictory data" },
        { status: 400 }
      );
    }

    logger.info("Root cause analysis complete", {
      analysisId: result.analysisId,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    logger.error("Root cause analysis error", err.message);

    if (error instanceof RuntimeError) {
      return Response.json(
        error.toOperatorSafeJSON(),
        { status: error.metadata.http_status }
      );
    }

    return Response.json(
      { error: "Root cause analysis failed" },
      { status: 500 }
    );
  }
});
