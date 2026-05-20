import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const recordMetricsSchema = z.object({
  cohortMonth: z.string().regex(/^\d{4}-\d{2}$/, "Cohort month must be YYYY-MM format"),
  cohortSize: z.number().positive("Cohort size must be positive"),
  monthlyRetention: z.record(z.string(), z.number().min(0).max(1, "Retention rates must be 0-1")),
  avgMonthlyChurn: z.number().min(0).max(1, "Average monthly churn must be 0-1"),
});

const assessChurnRiskSchema = z.object({
  cohortMonth: z.string().regex(/^\d{4}-\d{2}$/),
  cohortSize: z.number().positive(),
  monthlyRetention: z.record(z.string(), z.number().min(0).max(1)),
  avgMonthlyChurn: z.number().min(0).max(1),
});

/**
 * POST /api/growth/retention-metrics
 *
 * Record retention metrics for a cohort (workspace-scoped)
 * Wire: RetentionEngine.recordMetrics()
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
    const validated = recordMetricsSchema.parse(body);

    // Convert monthlyRetention keys from string to number for service call
    const monthlyRetention: Record<number, number> = {};
    Object.entries(validated.monthlyRetention).forEach(([key, value]) => {
      monthlyRetention[parseInt(key, 10)] = value;
    });

    const result = RetentionEngine.recordMetrics(workspaceId, {
      cohortMonth: validated.cohortMonth,
      cohortSize: validated.cohortSize,
      monthlyRetention,
      avgMonthlyChurn: validated.avgMonthlyChurn,
    });

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
      const classified = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: classified.operatorMessage }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/growth/retention-metrics/assess-churn
 *
 * Assess churn risk for retention metrics
 * Wire: RetentionEngine.assessChurnRisk()
 */
export async function assessChurnRiskHandler(
  workspaceId: string,
  metrics: any
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return RetentionEngine.assessChurnRisk(workspaceId, metrics);
}

/**
 * POST /api/growth/retention-metrics/forecast
 *
 * Forecast churn for upcoming periods
 * Wire: RetentionEngine.forecastChurn()
 */
export async function forecastChurnHandler(
  workspaceId: string,
  monthlyRetention: Record<number, number>,
  trendDays?: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return RetentionEngine.forecastChurn(workspaceId, monthlyRetention, trendDays);
}
