import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rootCauseEngine } from "@/services/diagnostic-core/root-cause-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { RuntimeError } from "@/runtime/runtime-errors";
import { BadRequestError, ForbiddenError, AppError } from "@/infra/errors";
import { db } from "@/lib/db";
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
    throw new BadRequestError("idempotency-key header required");
  }

  const body = await parseRequestBody(request, rootCauseSchema);

  // Validate caller has active membership in the requested workspace.
  // body.workspaceId is untrusted: any authenticated user could submit any UUID.
  // Without this check, a user from workspace A could trigger idempotency cache
  // writes and analysis results scoped under workspace B.
  const membership = await db.workspaceMembership.findFirst({
    where: {
      workspaceId: body.workspaceId,
      userId: authContext.session.user.id,
      isActive: true,
    },
    select: { role: true },
  });
  if (!membership) {
    throw new ForbiddenError("Access denied: not an active member of this workspace");
  }

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "analyzeRootCause",
    authContext,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return idempotencyCheck.cachedResponse.body;
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
      throw new BadRequestError("Analysis failed: insufficient or contradictory data");
    }

    logger.info("Root cause analysis complete", {
      analysisId: result.analysisId,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    logger.error("Root cause analysis error", err.message);

    if (error instanceof RuntimeError) {
      throw error;
    }

    throw new AppError(
      "INTERNAL_ERROR",
      "Root cause analysis failed",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
});
