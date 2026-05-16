import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { archetypeEngine } from "@/services/diagnostic-core/archetype-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
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

  const body = await parseRequestBody(request, archetypeSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "analyzeArchetype",
    authContext,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    logger.info("Archetype analysis requested", {
      engagementId: body.engagementId,
      workspaceId: body.workspaceId,
      userId: authContext.session.user.id,
    });

    const result = await archetypeEngine.analyzeArchetype(
      body.engagementId,
      body.workspaceId,
      body.indicators
    );

    if (!result) {
      await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for archetype analysis"));
      return Response.json(
        { error: "Analysis failed: insufficient data" },
        { status: 400 }
      );
    }

    logger.info("Archetype analysis complete", {
      analysisId: result.analysisId,
      archetype: result.selectedArchetype.archetyppe,
      riskProfile: result.selectedArchetype.riskProfile,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    logger.error("Archetype analysis error", { error: err.message });
    return Response.json(
      { error: err.message || "Archetype analysis failed" },
      { status: 500 }
    );
  }
});
