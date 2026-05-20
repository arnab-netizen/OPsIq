import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { maturityEngine } from "@/services/diagnostic-core/maturity-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
import { z } from "zod/v4";

const maturitySchema = z.object({
  engagementId: z.string().uuid("Valid engagement ID required"),
  workspaceId: z.string().uuid("Valid workspace ID required"),
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

  const body = await parseRequestBody(request, maturitySchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "analyzeMaturity",
    authContext,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    logger.info("Maturity analysis requested", {
      engagementId: body.engagementId,
      workspaceId: body.workspaceId,
      userId: authContext.session.user.id,
    });

    const result = await maturityEngine.analyzeMaturity(
      body.engagementId,
      body.workspaceId,
      body.indicators
    );

    if (!result) {
      await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for maturity analysis", auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown"));
      return Response.json(
        { error: "Analysis failed: insufficient data" }, auditContext, { status: 400 }
      );
    }

    logger.info("Maturity analysis complete", {
      analysisId: result.analysisId,
      maturityLevel: result.currentMaturity.maturityLevel,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, auditContext, unknown>, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
    logger.error("Maturity analysis error", auditContext, { error: err.message });
    return Response.json(
      { error: err.message || "Maturity analysis failed" },
      { status: 500 }
    );
  }
});
