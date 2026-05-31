import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { archetypeEngine } from "@/services/diagnostic-core/archetype-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { RuntimeError } from "@/runtime/runtime-errors";
import { BadRequestError, AppError } from "@/infra/errors";
import { z } from "zod/v4";

const archetypeSchema = z.object({
  engagementId: z.string().uuid("Valid engagement ID required"),
  workspaceId: z.string().uuid("Valid workspace ID required"),
  indicators: z.object({
    revenueTrend: z.number().describe("Revenue growth %"),
    profitMargin: z.number().describe("Net profit margin %"),
    cashFlow: z.number().describe("Monthly cash flow $"),
    debtToEquity: z.number().describe("Debt to equity ratio"),
    marketShare: z.number().describe("Market share %"),
    customerAcquisitionCost: z.number().describe("CAC $"),
    customerLifetimeValue: z.number().describe("LTV $"),
    burnRate: z.number().describe("Monthly burn rate $"),
    runwayMonths: z.number().describe("Months of runway"),
  }),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new BadRequestError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, archetypeSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "analyzeArchetype",
      authContext: ctx,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      logger.info("Archetype analysis requested", {
        engagementId: body.engagementId,
        workspaceId: ctx.verifiedWorkspaceId,
        userId: ctx.verifiedActorId,
      });

      const result = await archetypeEngine.analyzeArchetype(
        body.engagementId,
        ctx.verifiedWorkspaceId,
        body.indicators
      );

      if (!result) {
        await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for archetype analysis"));
        throw new BadRequestError("Analysis failed: insufficient data");
      }

      logger.info("Archetype analysis complete", {
        analysisId: result.analysisId,
        archetype: result.selectedArchetype.archetyppe,
        riskProfile: result.selectedArchetype.riskProfile,
        confidence: result.overallConfidence,
      });

      await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      logger.error("Archetype analysis error", err.message);

      if (error instanceof RuntimeError) {
        throw error;
      }

      throw new AppError(
        "INTERNAL_ERROR",
        "Archetype analysis failed",
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
