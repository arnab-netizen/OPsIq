import { classifyOperatorError } from "@/lib/operator-error-governance";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
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
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    if (!workspaceId) {
      return Response.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    const nextRequest = ctx.request as NextRequest;
    const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
    if (!membership) {
      throw new ForbiddenError("Unauthorized");
    }

    try {
      const body = await ctx.request?.json() || {};
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
        const governed = classifyOperatorError(error, { context: "load" });
        return Response.json({ error: governed.operatorMessage }, { status: 400 });
      }

      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE],
    requireWorkspace: true,
  }
);

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
