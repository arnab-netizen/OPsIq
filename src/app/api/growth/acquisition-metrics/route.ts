import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const recordMetricsSchema = z.object({
  channel: z.nativeEnum(AcquisitionChannel),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
  leads: z.number().nonnegative("Leads must be non-negative"),
  qualifiedLeads: z.number().nonnegative("Qualified leads must be non-negative").optional(),
  conversions: z.number().nonnegative("Conversions must be non-negative"),
  costPerLead: z.number().nonnegative("Cost per lead must be non-negative"),
  costPerAcquisition: z.number().nonnegative("Cost per acquisition must be non-negative"),
  targetCPA: z.number().nonnegative("Target CPA must be non-negative"),
});

const analyzeConversionSchema = z.object({
  channel: z.nativeEnum(AcquisitionChannel),
  month: z.string(),
  leads: z.number().positive(),
  qualifiedLeads: z.number().nonnegative().optional(),
  conversions: z.number().nonnegative(),
  costPerLead: z.number().nonnegative(),
  costPerAcquisition: z.number().nonnegative(),
  targetCPA: z.number().nonnegative(),
});

/**
 * POST /api/growth/acquisition-metrics
 *
 * Record acquisition metrics for a channel (workspace-scoped)
 * Wire: AcquisitionEngine.recordMetrics()
 */
export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = ctx.verifiedWorkspaceId;
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const body = await request.json();
    const validated = recordMetricsSchema.parse(body);

    const result = AcquisitionEngine.recordMetrics(workspaceId, validated);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result.metrics, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/growth/acquisition-metrics/analyze-conversion
 *
 * Analyze conversion rates for acquisition metrics
 * Wire: AcquisitionEngine.analyzeConversion()
 */
export async function analyzeConversionHandler(
  workspaceId: string,
  metrics: any
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return AcquisitionEngine.analyzeConversion(workspaceId, metrics);
}

/**
 * POST /api/growth/acquisition-metrics/roi
 *
 * Calculate ROI for acquisition channel
 * Wire: AcquisitionEngine.calculateROI()
 */
export async function calculateROIHandler(
  workspaceId: string,
  metrics: any,
  ltv: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return AcquisitionEngine.calculateROI(workspaceId, metrics, ltv);
}
