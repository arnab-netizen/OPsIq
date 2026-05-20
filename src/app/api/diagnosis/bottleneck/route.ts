import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { bottleneckEngine } from "@/services/diagnostic-core/bottleneck-engine";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { logger } from "@/infra/logger";
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
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, bottleneckSchema);

  const auditContext = createServiceCapabilityContext({
    capability: CAPABILITIES.DIAGNOSIS_READ,
  });

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "analyzeBottleneck",
    workspaceId: body.workspaceId,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
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
      await recordIdempotencyError(idempotencyKey, new Error("Insufficient data for bottleneck analysis"), auditContext, body.workspaceId);
      return Response.json(
        { error: "Analysis failed: insufficient data" },
        { status: 400 }
      );
    }

    logger.info("Bottleneck analysis complete", {
      analysisId: result.analysisId,
      bottleneck: result.primaryBottleneck.bottleneckVariable,
      confidence: result.overallConfidence,
    });

    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>, auditContext, body.workspaceId);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, body.workspaceId);
    logger.error("Bottleneck analysis error", { error: err.message });
    return Response.json(
      { error: err.message || "Bottleneck analysis failed" },
      { status: 500 }
    );
  }
});
