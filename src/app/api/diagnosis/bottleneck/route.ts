import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { bottleneckEngine } from "@/services/diagnostic-core/bottleneck-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { RuntimeError } from "@/runtime/runtime-errors";
import { BadRequestError, ForbiddenError, AppError } from "@/infra/errors";
import { db } from "@/lib/db";
import { z } from "zod/v4";

const bottleneckSchema = z.object({
  engagementId: z.string().uuid("Valid engagement ID required"),
  workspaceId: z.string().uuid("Valid workspace ID required"),
  metrics: z.record(z.string(), z.number()),
  timelineData: z.record(z.string(), z.object({
    value: z.number(),
    timestamp: z.string().transform(s => new Date(s)),
  })),
  affectedKpis: z.record(z.string(), z.number()),
}).refine(
  (data) => Object.keys(data.metrics).length >= 2,
  { message: "At least 2 metrics required", path: ["metrics"] }
).refine(
  (data) => Object.keys(data.timelineData).length >= 2,
  { message: "At least 2 timeline data points required", path: ["timelineData"] }
).refine(
  (data) => Object.keys(data.affectedKpis).length >= 1,
  { message: "At least 1 affected KPI required", path: ["affectedKpis"] }
);

export const POST = withEnforcementFull(async (request) => {
  const authContext = await withAuth({
    capability: CAPABILITIES.DIAGNOSIS_READ,
    internalOnly: false,
  });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new BadRequestError("idempotency-key header required");
  }

  const body = await parseRequestBody(request, bottleneckSchema);

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
    operationName: "analyzeBottleneck",
    authContext,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return idempotencyCheck.cachedResponse.body;
  }

  try {
    logger.info("Bottleneck analysis requested", {
      engagementId: body.engagementId,
      workspaceId: body.workspaceId,
      userId: authContext.session.user.id,
    });

    const result = await bottleneckEngine.analyzeBottleneck(
      body.engagementId,
      body.workspaceId,
      body.metrics,
      body.timelineData,
      body.affectedKpis
    );

    if (!result) {
      await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for bottleneck analysis"));
      throw new BadRequestError("Analysis failed: insufficient data");
    }

    logger.info("Bottleneck analysis complete", {
      analysisId: result.analysisId,
      bottleneck: result.primaryBottleneck.bottleneckVariable,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    logger.error("Bottleneck analysis error", err.message);

    if (error instanceof RuntimeError) {
      throw error;
    }

    throw new AppError(
      "INTERNAL_ERROR",
      "Bottleneck analysis failed",
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
