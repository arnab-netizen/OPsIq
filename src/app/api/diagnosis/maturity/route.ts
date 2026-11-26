import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { maturityEngine } from "@/services/diagnostic-core/maturity-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { RuntimeError } from "@/runtime/runtime-errors";
import { BadRequestError, AppError } from "@/infra/errors";
import { z } from "zod/v4";

const maturitySchema = z.object({
  engagementId: z.string().uuid("Valid engagement ID required"),
  indicators: z.object({
    processDocumentation: z.number().min(0).max(100).describe("Process documentation %"),
    processConsistency: z.number().min(0).max(100).describe("Process consistency %"),
    teamTraining: z.number().min(0).max(100).describe("Team training %"),
    toolsAvailable: z.number().min(0).max(100).describe("Tools available %"),
    dataQuality: z.number().min(0).max(100).describe("Data quality %"),
    decisionTracking: z.number().min(0).max(100).describe("Decision tracking %"),
    riskManagement: z.number().min(0).max(100).describe("Risk management %"),
    governanceStructure: z.number().min(0).max(100).describe("Governance structure %"),
    executionTrackRecord: z.number().min(0).max(100).describe("Execution track record %"),
  }),
});

export const POST = withCanonicalEnforcement(
  async (ctx) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new BadRequestError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, maturitySchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "analyzeMaturity",
      actorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      logger.info("Maturity analysis requested", { engagementId: body.engagementId, workspaceId, actorId });

      const result = await maturityEngine.analyzeMaturity(
        body.engagementId,
        workspaceId,
        body.indicators
      );

      if (!result) {
        await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for maturity analysis"));
        throw new BadRequestError("Analysis failed: insufficient data");
      }

      logger.info("Maturity analysis complete", {
        analysisId: result.analysisId,
        maturityLevel: result.currentMaturity.maturityLevel,
        confidence: result.overallConfidence,
      });

      await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      logger.error("Maturity analysis error", err.message);

      if (error instanceof RuntimeError) {
        throw error;
      }

      throw new AppError(
        "INTERNAL_ERROR",
        "Maturity analysis failed",
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
