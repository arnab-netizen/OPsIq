import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const recordDealSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  stage: z.nativeEnum(DealStage),
  value: z.number().positive("Deal value must be positive"),
  currency: z.string().length(3, "Currency must be 3-letter code"),
  probability: z.number().min(0).max(1, "Probability must be 0-1").optional(),
  expectedCloseDate: z.coerce.date(),
  owner: z.string().optional(),
  notes: z.string().optional(),
});

const progressDealSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required"),
  newStage: z.nativeEnum(DealStage),
});

const calculateMetricsSchema = z.object({
  deals: z.array(z.object({
    id: z.string(),
    companyName: z.string(),
    stage: z.nativeEnum(DealStage),
    value: z.number(),
    currency: z.string(),
    probability: z.number().min(0).max(1),
    expectedCloseDate: z.coerce.date(),
    owner: z.string().optional(),
    notes: z.string().optional(),
  })),
});

/**
 * POST /api/growth/sales-pipeline/deals
 *
 * Record a sales deal (workspace-scoped)
 * Wire: SalesPipelineEngine.recordDeal()
 */
export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
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
    const validated = recordDealSchema.parse(body);

    const result = SalesPipelineEngine.recordDeal(workspaceId, validated);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result.deal, { status: 201 });
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
 * POST /api/growth/sales-pipeline/progress
 *
 * Progress a deal to next stage
 * Wire: SalesPipelineEngine.progressDeal()
 */
export async function progressDealHandler(
  workspaceId: string,
  dealId: string,
  newStage: DealStage
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return SalesPipelineEngine.progressDeal(workspaceId, dealId, newStage);
}

/**
 * POST /api/growth/sales-pipeline/metrics
 *
 * Calculate pipeline metrics for deals
 * Wire: SalesPipelineEngine.calculatePipelineMetrics()
 */
export async function calculateMetricsHandler(
  workspaceId: string,
  deals: any[]
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);
}

/**
 * POST /api/growth/sales-pipeline/forecast
 *
 * Forecast pipeline revenue
 * Wire: SalesPipelineEngine.forecastPipelineRevenue()
 */
export async function forecastRevenueHandler(
  workspaceId: string,
  deals: any[],
  months?: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, months);
}
