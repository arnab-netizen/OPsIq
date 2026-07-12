import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rootCauseEngine } from "@/services/diagnostic-core/root-cause-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { RuntimeError } from "@/runtime/runtime-errors";
import { BadRequestError, AppError } from "@/infra/errors";
import { z } from "zod/v4";

const rootCauseSchema = z.object({
  engagementId: z.string().uuid("Valid engagement ID required"),
  metrics: z.record(z.string(), z.number()),
  observations: z.array(z.string()).min(2, "At least 2 observations required"),
  timeline: z.record(z.string(), z.string().transform(s => new Date(s))),
});

export const POST = withCanonicalEnforcement(
  async (ctx) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new BadRequestError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, rootCauseSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "analyzeRootCause",
      actorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      logger.info("Root cause analysis requested", { engagementId: body.engagementId, workspaceId, actorId });

      const result = await rootCauseEngine.analyzeRootCause(
        body.engagementId,
        workspaceId,
        body.metrics,
        body.observations,
        body.timeline
      );

      if (!result) {
        await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for root cause analysis"));
        throw new BadRequestError("Analysis failed: insufficient or contradictory data");
      }

      logger.info("Root cause analysis complete", { analysisId: result.analysisId, confidence: result.overallConfidence });

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
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.DIAGNOSIS_READ] }
);
